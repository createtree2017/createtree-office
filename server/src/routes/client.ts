import { Router } from "express";
import { db } from "../db/index.js";
import { clients, users, tasks } from "../db/schema.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { google } from "googleapis";
import { eq, isNull, isNotNull, asc } from "drizzle-orm";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 최대 20MB
const CLIENTS_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID || '';

// ────────────────────────────────────────────
// 공통 Drive 헬퍼
// ────────────────────────────────────────────
function getDrive() {
    let authOptions: any = { scopes: ['https://www.googleapis.com/auth/drive'] };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    const auth = new google.auth.GoogleAuth(authOptions);
    return google.drive({ version: 'v3', auth });
}

async function findOrCreateFolder(drive: any, name: string, parentId: string): Promise<string | null> {
    try {
        const res = await drive.files.list({
            q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        if (res.data.files?.length > 0) return res.data.files[0].id;
        const created = await drive.files.create({
            requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
            fields: 'id',
            supportsAllDrives: true,
        });
        console.log(`📁 폴더 생성: "${name}" (${created.data.id})`);
        return created.data.id || null;
    } catch (e: any) {
        console.error('findOrCreateFolder error:', e.message);
        return null;
    }
}

async function moveFolderTo(drive: any, fileId: string, newParentId: string): Promise<boolean> {
    try {
        const file = await drive.files.get({ fileId, fields: 'parents', supportsAllDrives: true });
        const prevParents = (file.data.parents || []).join(',');
        await drive.files.update({
            fileId, addParents: newParentId, removeParents: prevParents,
            supportsAllDrives: true, fields: 'id, parents',
        });
        console.log(`📦 드라이브 폴더 이동: ${fileId} → ${newParentId}`);
        return true;
    } catch (e: any) {
        console.error('moveFolderTo error:', e.message);
        return false;
    }
}

// ────────────────────────────────────────────
// GET /api/clients
// 거래처 목록 조회 — deletedAt IS NULL (삭제되지 않은 거래처만)
// ────────────────────────────────────────────
router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const allClients = await db.select().from(clients)
            .where(isNull(clients.deletedAt))
            .orderBy(asc(clients.sortOrder));
        res.json({ success: true, data: allClients });
    } catch (error: any) {
        console.error("Client fetch error:", error);
        res.status(500).json({ success: false, message: "거래처 목록을 불러오지 못했습니다." });
    }
});

// ────────────────────────────────────────────
// POST /api/clients
// 새 거래처 생성 + 구글 드라이브 폴더 자동 생성
// ────────────────────────────────────────────
router.post("/", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "거래처명이 필요합니다." });

        const drive = getDrive();

        // 1. 거래처 Drive 폴더 생성
        const driveResponse = await drive.files.create({
            requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [CLIENTS_ROOT_FOLDER_ID] },
            fields: 'id',
            supportsAllDrives: true,
        });
        const driveFolderId = driveResponse.data.id;
        if (!driveFolderId) throw new Error("드라이브 폴더 ID를 받지 못했습니다.");

        // 2. 현재 최대 sortOrder 조회 후 마지막에 추가
        const existing = await db.select({ so: clients.sortOrder }).from(clients).orderBy(asc(clients.sortOrder));
        const maxOrder = existing.length > 0 ? Math.max(...existing.map(e => e.so)) : 0;

        // 3. DB 저장
        const [newClient] = await db.insert(clients).values({
            name,
            driveFolderId,
            sortOrder: maxOrder + 1,
        }).returning();
        res.json({ success: true, data: newClient });
    } catch (error: any) {
        console.error("Client create error:", error.response?.data || error);
        res.status(500).json({ success: false, message: "거래처 생성에 실패했습니다.", errorDetail: error.message });
    }
});

// ────────────────────────────────────────────
// PUT /api/clients/reorder
// 병원 카드 순서 변경 (드래그 정렬)
// ────────────────────────────────────────────
router.put("/reorder", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { orderedIds } = req.body; // [clientId1, clientId2, ...] 순서대로
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            return res.status(400).json({ success: false, message: "정렬 순서 데이터가 필요합니다." });
        }
        for (let i = 0; i < orderedIds.length; i++) {
            await db.update(clients)
                .set({ sortOrder: i, updatedAt: new Date() })
                .where(eq(clients.id, orderedIds[i]));
        }
        res.json({ success: true, message: `${orderedIds.length}개 거래처 순서가 변경되었습니다.` });
    } catch (error: any) {
        console.error("Client reorder error:", error);
        res.status(500).json({ success: false, message: "순서 변경 중 오류가 발생했습니다." });
    }
});


// ────────────────────────────────────────────
// PATCH /api/clients/:id
// 거래처명 + 계약기간 + 계약서 파일 수정
// ────────────────────────────────────────────
router.patch("/:id", authenticateToken, authorizeRole(["ADMIN"]), upload.single('businessRegFile'), async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const { name, contractStartDate, contractEndDate } = req.body;
        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 거래처 ID입니다." });

        const [existingClient] = await db.select().from(clients).where(eq(clients.id, clientId));
        if (!existingClient) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });

        // 사업자등록증 파일 처리 (업로드된 경우에만)
        let businessRegDriveId = existingClient.businessRegDriveId;
        let businessRegFileName = existingClient.businessRegFileName;
        const uploadedFile = (req as any).file;
        if (uploadedFile && existingClient.driveFolderId) {
            try {
                const { Readable } = await import('stream');
                const fileStream = Readable.from(uploadedFile.buffer);
                const drive2 = getDrive();
                const fileResponse = await drive2.files.create({
                    requestBody: { name: uploadedFile.originalname, parents: [existingClient.driveFolderId] },
                    media: { mimeType: uploadedFile.mimetype, body: fileStream },
                    fields: 'id',
                    supportsAllDrives: true,
                });
                businessRegDriveId = fileResponse.data.id || null;
                businessRegFileName = uploadedFile.originalname;
                console.log(`📎 사업자등록증 업데이트: "${businessRegFileName}"`);
            } catch (fileErr: any) {
                console.error("사업자등록증 업로드 실패:", fileErr.message);
            }
        }

        // 이름이 변경된 경우 드라이브 폴더명 동기화
        if (name && name !== existingClient.name && existingClient.driveFolderId) {
            try {
                const drive = getDrive();
                await drive.files.update({
                    fileId: existingClient.driveFolderId,
                    requestBody: { name },
                    supportsAllDrives: true,
                });
            } catch (driveErr: any) {
                console.error("Drive rename error:", driveErr.message);
                return res.status(500).json({ success: false, message: "구글 드라이브 폴더 변경에 실패했습니다." });
            }
        }

        const updateData: any = { updatedAt: new Date(), businessRegDriveId, businessRegFileName };
        if (name) updateData.name = name;
        if (contractStartDate !== undefined) updateData.contractStartDate = contractStartDate || null;
        if (contractEndDate !== undefined) updateData.contractEndDate = contractEndDate || null;

        const [updatedClient] = await db.update(clients)
            .set(updateData)
            .where(eq(clients.id, clientId))
            .returning();
        res.json({ success: true, data: updatedClient });
    } catch (error: any) {
        console.error("Client update error:", error);
        res.status(500).json({ success: false, message: "거래처 수정에 실패했습니다." });
    }
});

// ────────────────────────────────────────────
// POST /api/clients/:id/terminate
// 계약종료: contractEndedAt 설정 + 드라이브 거래처 폴더 → "계약종료" 폴더로 이동
// ────────────────────────────────────────────
router.post("/:id/terminate", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
        if (!client) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });
        if (client.contractEndedAt) return res.status(409).json({ success: false, message: "이미 계약종료된 거래처입니다." });

        // 드라이브 거래처 폴더 처리: 이름 변경 → "계약종료" 폴더로 이동
        let driveMsg = "";
        if (client.driveFolderId) {
            try {
                const drive = getDrive();
                const now2 = new Date();
                const dateStr = `${now2.getFullYear()}${String(now2.getMonth()+1).padStart(2,'0')}${String(now2.getDate()).padStart(2,'0')}`;
                const archivedName = `종료_${client.name}_${dateStr}`;

                // 1단계: 폴더명 변경 ("포유문산부인과" → "종료_포유문산부인과_20260313")
                await drive.files.update({
                    fileId: client.driveFolderId,
                    requestBody: { name: archivedName },
                    supportsAllDrives: true,
                });
                console.log(`✏️ 드라이브 폴더명 변경: "${client.name}" → "${archivedName}"`);

                // 2단계: "계약종료" 폴더로 이동
                const archiveFolderId = await findOrCreateFolder(drive, "계약종료", CLIENTS_ROOT_FOLDER_ID);
                if (archiveFolderId) {
                    const moved = await moveFolderTo(drive, client.driveFolderId, archiveFolderId);
                    driveMsg = moved
                        ? ` 드라이브 폴더가 "${archivedName}"으로 이름 변경 후 [계약종료] 폴더로 이동되었습니다.`
                        : " (드라이브 폴더 이동 실패 — 수동 확인 필요)";
                }
            } catch (driveErr: any) {
                console.warn("Drive move warning:", driveErr.message);
                driveMsg = " (드라이브 처리 오류 — 수동 확인 필요)";
            }
        }


        const now = new Date();
        const [updated] = await db.update(clients)
            .set({ contractEndedAt: now, updatedAt: now })
            .where(eq(clients.id, clientId))
            .returning();

        res.json({
            success: true,
            data: updated,
            message: `"${client.name}" 계약이 종료되었습니다.${driveMsg}`,
        });
    } catch (error: any) {
        console.error("Client terminate error:", error);
        res.status(500).json({ success: false, message: "계약 종료 처리 중 오류가 발생했습니다." });
    }
});


// ────────────────────────────────────────────
// DELETE /api/clients/:id
// 거래처 삭제 (소프트 삭제: deletedAt 설정 + 드라이브 폴더 휴지통)
// - 연결된 견적서/계약서는 그대로 유지 (흐림 표시용)
// - 모니터링 등 관련 데이터도 유지됨
// ────────────────────────────────────────────
router.delete("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
        if (!client) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });

        // 드라이브 폴더 → 휴지통으로 이동 (영구삭제 아님)
        let driveMsg = "";
        if (client.driveFolderId) {
            try {
                const drive = getDrive();
                await drive.files.update({
                    fileId: client.driveFolderId,
                    requestBody: { trashed: true },
                    supportsAllDrives: true,
                });
                driveMsg = " 드라이브 폴더가 휴지통으로 이동되었습니다.";
            } catch (driveErr: any) {
                console.warn("Drive trash warning:", driveErr.message);
                driveMsg = " (드라이브 폴더 이동 실패 — 수동 확인 필요)";
            }
        }

        // 소프트 삭제: deletedAt 설정 (DB 레코드 유지, 모니터링 등 영향 없음)
        const now = new Date();
        await db.update(clients)
            .set({ deletedAt: now, updatedAt: now })
            .where(eq(clients.id, clientId));

        res.json({
            success: true,
            message: `"${client.name}" 거래처가 삭제되었습니다.${driveMsg}`,
        });
    } catch (error: any) {
        console.error("Client delete error:", error);
        res.status(500).json({ success: false, message: "거래처 삭제 중 오류가 발생했습니다." });
    }
});



// ────────────────────────────────────────────
// POST /api/clients/sync
// 드라이브 → DB 동기화 (계약종료 폴더 제외)
// ────────────────────────────────────────────
router.post("/sync", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const drive = getDrive();
        const driveResponse = await drive.files.list({
            q: `'${CLIENTS_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
        });
        const driveFolders = driveResponse.data.files || [];
        const existingClients = await db.select().from(clients);
        const existingDriveIds = new Set(existingClients.map(c => c.driveFolderId).filter(Boolean));
        const clientByName = new Map(existingClients.map(c => [c.name, c]));

        let addedCount = 0, updatedCount = 0;
        for (const folder of driveFolders) {
            if (!folder.id || !folder.name) continue;
            if (folder.name === '계약종료') continue; // 계약종료 폴더 자체는 스킵
            const existing = clientByName.get(folder.name);
            if (existing) {
                if (existing.driveFolderId !== folder.id) {
                    await db.update(clients).set({ driveFolderId: folder.id, updatedAt: new Date() }).where(eq(clients.id, existing.id));
                    updatedCount++;
                }
            } else if (!existingDriveIds.has(folder.id)) {
                await db.insert(clients).values({ name: folder.name, driveFolderId: folder.id });
                addedCount++;
            }
        }

        const msgs = [];
        if (updatedCount > 0) msgs.push(`${updatedCount}개 드라이브 ID 업데이트.`);
        if (addedCount > 0) msgs.push(`${addedCount}개 신규 거래처 등록.`);
        res.json({ success: true, message: msgs.length > 0 ? msgs.join(' ') : "이미 최신 상태입니다." });
    } catch (error: any) {
        console.error("Client sync error:", error);
        res.status(500).json({ success: false, message: "동기화 중 오류가 발생했습니다.", errorDetail: error.message });
    }
});

// ────────────────────────────────────────────
// PATCH /api/clients/:id/link — 견적서/계약서 수동 연결/해제
// body: { linkedQuotationId?: number | null, linkedContractId?: number | null }
// ────────────────────────────────────────────
router.patch("/:id/link", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

        const [existing] = await db.select().from(clients).where(eq(clients.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });

        const updates: any = { updatedAt: new Date() };
        const messages: string[] = [];

        if (req.body.linkedQuotationId !== undefined) {
            updates.linkedQuotationId = req.body.linkedQuotationId;
            messages.push(req.body.linkedQuotationId ? "견적서 연결됨" : "견적서 연결 해제됨");
        }
        if (req.body.linkedContractId !== undefined) {
            updates.linkedContractId = req.body.linkedContractId;
            messages.push(req.body.linkedContractId ? "계약서 연결됨" : "계약서 연결 해제됨");
        }

        await db.update(clients).set(updates).where(eq(clients.id, id));
        res.json({ success: true, message: messages.join(', ') || "변경사항 없음" });
    } catch (error: any) {
        console.error("Link update error:", error);
        res.status(500).json({ success: false, message: "연결 업데이트 실패" });
    }
});

export default router;

import { Router } from "express";
import { db } from "../db/index.js";
import { clientServiceContracts, clients, taskTemplates } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { google } from "googleapis";

const router = Router();

// ────────────────────────────────────────────
// 공통 헬퍼: Google Drive 클라이언트 초기화
// ────────────────────────────────────────────
function getDriveClient() {
    let authOptions: any = { scopes: ["https://www.googleapis.com/auth/drive"] };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    const auth = new google.auth.GoogleAuth(authOptions);
    return google.drive({ version: "v3", auth });
}

// ────────────────────────────────────────────
// 공통 헬퍼: 드라이브 폴더 생성
// ────────────────────────────────────────────
async function createDriveFolder(folderName: string, parentFolderId: string): Promise<string | null> {
    try {
        const drive = getDriveClient();
        const file = await drive.files.create({
            requestBody: {
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                parents: [parentFolderId],
            },
            fields: "id",
            supportsAllDrives: true,
        });
        console.log(`📁 드라이브 폴더 생성: "${folderName}" (${file.data.id}) ← parent: ${parentFolderId}`);
        return file.data.id || null;
    } catch (error: any) {
        console.error("드라이브 폴더 생성 오류:", error.message);
        return null;
    }
}

// ────────────────────────────────────────────
// 공통 헬퍼: 이름으로 폴더 찾기 (없으면 생성)
// ────────────────────────────────────────────
async function findOrCreateFolder(folderName: string, parentFolderId: string): Promise<string | null> {
    try {
        const drive = getDriveClient();
        const result = await drive.files.list({
            q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: "files(id, name)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        if (result.data.files && result.data.files.length > 0) {
            console.log(`📁 기존 폴더 재사용: "${folderName}" (${result.data.files[0].id})`);
            return result.data.files[0].id || null;
        }
        return await createDriveFolder(folderName, parentFolderId);
    } catch (error: any) {
        console.error("폴더 찾기/생성 오류:", error.message);
        return null;
    }
}

// ────────────────────────────────────────────
// 공통 헬퍼: 드라이브 폴더를 다른 폴더로 이동
// ────────────────────────────────────────────
async function moveFolderTo(fileId: string, newParentId: string): Promise<boolean> {
    try {
        const drive = getDriveClient();
        const file = await drive.files.get({
            fileId,
            fields: "parents",
            supportsAllDrives: true,
        });
        const previousParents = (file.data.parents || []).join(",");
        await drive.files.update({
            fileId,
            addParents: newParentId,
            removeParents: previousParents,
            supportsAllDrives: true,
            fields: "id, parents",
        });
        console.log(`📦 드라이브 폴더 이동 완료: ${fileId} → parent: ${newParentId}`);
        return true;
    } catch (error: any) {
        console.error("드라이브 폴더 이동 오류:", error.message);
        return false;
    }
}

// ────────────────────────────────────────────
// GET /api/client-contracts/:clientId
// 거래처별 계약 서비스 목록 조회
// ────────────────────────────────────────────
router.get("/:clientId", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.clientId);
        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 거래처 ID입니다." });

        const contracts = await db
            .select({
                id: clientServiceContracts.id,
                clientId: clientServiceContracts.clientId,
                templateId: clientServiceContracts.templateId,
                driveFolderId: clientServiceContracts.driveFolderId,
                createdAt: clientServiceContracts.createdAt,
                templateTitle: taskTemplates.title,
                templateDescription: taskTemplates.description,
            })
            .from(clientServiceContracts)
            .leftJoin(taskTemplates, eq(clientServiceContracts.templateId, taskTemplates.id))
            .where(eq(clientServiceContracts.clientId, clientId));

        res.json({ success: true, data: contracts });
    } catch (error: any) {
        console.error("계약 서비스 조회 오류:", error);
        res.status(500).json({ success: false, message: "계약 서비스 조회 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// POST /api/client-contracts
// 거래처에 서비스 계약 추가 + 드라이브 템플릿 폴더 생성
// ────────────────────────────────────────────
router.post("/", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { clientId, templateId } = req.body;
        if (!clientId || !templateId) {
            return res.status(400).json({ success: false, message: "clientId와 templateId가 필요합니다." });
        }

        // 중복 계약 체크
        const [existing] = await db
            .select()
            .from(clientServiceContracts)
            .where(and(eq(clientServiceContracts.clientId, clientId), eq(clientServiceContracts.templateId, templateId)));
        if (existing) {
            return res.status(409).json({ success: false, message: "이미 계약된 서비스입니다." });
        }

        const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
        const [template] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, templateId));

        if (!client) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });
        if (!template) return res.status(404).json({ success: false, message: "업무 템플릿을 찾을 수 없습니다." });

        let driveFolderId: string | null = null;
        if (client.driveFolderId) {
            driveFolderId = await createDriveFolder(template.title, client.driveFolderId);
        } else {
            console.warn(`⚠️ 거래처 "${client.name}"의 driveFolder가 없어 드라이브 폴더를 생성하지 않습니다.`);
        }

        const [newContract] = await db
            .insert(clientServiceContracts)
            .values({ clientId, templateId, driveFolderId })
            .returning();

        res.status(201).json({
            success: true,
            data: { ...newContract, templateTitle: template.title },
            message: driveFolderId
                ? `"${template.title}" 서비스 계약 등록 및 드라이브 폴더가 생성되었습니다.`
                : `"${template.title}" 서비스 계약이 등록되었습니다. (드라이브 폴더 미생성)`,
        });
    } catch (error: any) {
        console.error("계약 추가 오류:", error);
        res.status(500).json({ success: false, message: "계약 추가 중 오류가 발생했습니다.", detail: error.message });
    }
});

// ────────────────────────────────────────────
// DELETE /api/client-contracts/:id
// 계약 해제 → 드라이브 폴더를 "📦 계약종료" 폴더로 이동
// ────────────────────────────────────────────
router.delete("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [contract] = await db
            .select()
            .from(clientServiceContracts)
            .where(eq(clientServiceContracts.id, id));
        if (!contract) return res.status(404).json({ success: false, message: "계약을 찾을 수 없습니다." });

        // 드라이브 폴더 → "📦 계약종료" 폴더로 이동
        let driveMsg = "";
        if (contract.driveFolderId) {
            const [client] = await db.select().from(clients).where(eq(clients.id, contract.clientId));
            if (client?.driveFolderId) {
                const archiveFolderId = await findOrCreateFolder("📦 계약종료", client.driveFolderId);
                if (archiveFolderId) {
                    const moved = await moveFolderTo(contract.driveFolderId, archiveFolderId);
                    driveMsg = moved
                        ? " 드라이브 폴더가 [📦 계약종료] 폴더로 이동되었습니다."
                        : " (드라이브 폴더 이동 실패 — 수동 확인 필요)";
                }
            }
        }

        await db.delete(clientServiceContracts).where(eq(clientServiceContracts.id, id));

        res.json({ success: true, message: `서비스 계약이 해제되었습니다.${driveMsg}` });
    } catch (error: any) {
        console.error("계약 해제 오류:", error);
        res.status(500).json({ success: false, message: "계약 해제 중 오류가 발생했습니다." });
    }
});

export default router;

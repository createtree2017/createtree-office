import { Router } from "express";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { google } from "googleapis";
import { eq } from "drizzle-orm";

const router = Router();

// 모든 거래처 목록 조회 (관리자 / 매니저)
router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const allClients = await db.select().from(clients);
        res.json({ success: true, data: allClients });
    } catch (error: any) {
        console.error("Client fetch error:", error);
        res.status(500).json({ success: false, message: "거래처 목록을 불러오지 못했습니다." });
    }
});

// 새 거래처 생성 + 구글 드라이브 폴더 자동 생성 (최고 관리자)
router.post("/", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: "거래처명이 필요합니다." });
        }

        // 구글 드라이브 API 연동 (쓰기 권한)
        let authOptions: any = {
            scopes: ['https://www.googleapis.com/auth/drive'],
        };

        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }

        const auth = new google.auth.GoogleAuth(authOptions);
        const drive = google.drive({ version: 'v3', auth });

        // 생성할 최상위 부모 폴더 ID 지정 (기본값: '거래처 폴더' ID 반영)
        const parentFolderId = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID || '1SI_8POn6S3YqdEcrYIbFSzaU_r2fw5KI';

        const fileMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId]
        };

        const driveResponse = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id',
            supportsAllDrives: true
        });

        const driveFolderId = driveResponse.data.id;
        if (!driveFolderId) {
            throw new Error("구글 드라이브 폴더 생성에 실패하여 ID를 받지 못했습니다.");
        }

        // DB에 거래처 삽입
        const [newClient] = await db.insert(clients).values({
            name,
            driveFolderId
        }).returning();

        res.json({ success: true, data: newClient });
    } catch (error: any) {
        console.error("Client create error 상세 내용:", error.response?.data || error);
        res.status(500).json({
            success: false,
            message: "거래처 생성에 실패했습니다.",
            errorDetail: error.message
        });
    }
});

// 거래처명 업데이트 (구글 드라이브 폴더명 양방향 동기화)
router.patch("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const { name } = req.body;

        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 거래처 ID입니다." });
        if (!name) return res.status(400).json({ success: false, message: "변경할 거래처명이 필요합니다." });

        // 기존 거래처 정보 조회 
        const [existingClient] = await db.select().from(clients).where(eq(clients.id, clientId));
        if (!existingClient) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });

        // 구글 드라이브 폴더명 변경 연동
        if (existingClient.driveFolderId) {
            let authOptions: any = { scopes: ['https://www.googleapis.com/auth/drive'] };
            if (process.env.GOOGLE_CREDENTIALS_JSON) {
                authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
            } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            }

            const auth = new google.auth.GoogleAuth(authOptions);
            const drive = google.drive({ version: 'v3', auth });

            try {
                // 부모 폴더 내 이름 변경
                await drive.files.update({
                    fileId: existingClient.driveFolderId,
                    requestBody: { name }
                });
            } catch (driveErr: any) {
                console.error("Google Drive API Rename Error:", driveErr.message);
                return res.status(500).json({ success: false, message: "구글 드라이브 폴더 변경 권한에 실패했습니다." });
            }
        }

        // 데이터베이스 갱신
        const [updatedClient] = await db.update(clients)
            .set({ name, updatedAt: new Date() })
            .where(eq(clients.id, clientId))
            .returning();

        res.json({ success: true, data: updatedClient });
    } catch (error: any) {
        console.error("Client update error:", error);
        res.status(500).json({ success: false, message: "거래처 수정에 실패했습니다." });
    }
});

// 구글 드라이브 폴더 목록을 읽어 사이트 DB(clients)와 동기화 (목록 새로고침)
router.post("/sync", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        let authOptions: any = { scopes: ['https://www.googleapis.com/auth/drive.readonly'] };
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }

        const auth = new google.auth.GoogleAuth(authOptions);
        const drive = google.drive({ version: 'v3', auth });

        // 생성할 최상위 부모 폴더 ID 지정 (기본값: '거래처 폴더' ID 반영)
        const parentFolderId = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID || '1SI_8POn6S3YqdEcrYIbFSzaU_r2fw5KI';

        // 1. 구글 드라이브 내 해당 부모 폴더의 하위 폴더 목록 모두 가져오기
        const driveResponse = await drive.files.list({
            q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        const driveFolders = driveResponse.data.files || [];

        // 2. 현재 우리 사이트 DB의 모든 거래처(clients) 목록 가져오기
        const existingClients = await db.select().from(clients);
        const existingDriveIds = new Set(existingClients.map(c => c.driveFolderId).filter(Boolean));
        const existingNames = new Set(existingClients.map(c => c.name));

        let addedCount = 0;

        // 3. 드라이브에는 있는데 DB에 없는 폴더 찾아서 넣기
        for (const folder of driveFolders) {
            if (!folder.id || !folder.name) continue;

            // 이미 동일한 driveFolderId가 있거나 동명의 거래처가 있으면 패스
            if (existingDriveIds.has(folder.id) || existingNames.has(folder.name)) {
                continue;
            }

            // 새 거래처로 DB에 삽입
            await db.insert(clients).values({
                name: folder.name,
                driveFolderId: folder.id,
            });
            addedCount++;
        }

        res.json({
            success: true,
            message: addedCount > 0
                ? `구글 드라이브에서 ${addedCount}개의 새 병원(폴더)을 성공적으로 동기화했습니다.`
                : `현재 구글 드라이브와 사이트 목록이 최신 상태로 동일합니다.`
        });

    } catch (error: any) {
        console.error("Client sync error:", error);
        res.status(500).json({ success: false, message: "구글 드라이브 동기화 중 오류가 발생했습니다.", errorDetail: error.message });
    }
});

export default router;

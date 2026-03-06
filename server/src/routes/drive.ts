import express from "express";
import { google } from "googleapis";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = express.Router();

const MASTER_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID || '1G-Wyp42A3OzmwxadzXsiyLIN_TrOFtYz';

const getClientDriveFolderId = async (clientId: number | null | undefined) => {
    if (!clientId) return null;
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    return client?.driveFolderId || null;
};

/**
 * 특정 구글 드라이브 폴더의 파일 목록 조회
 * GET /api/drive/folders/:folderId
 */
router.get("/folders/:folderId", authenticateToken, async (req: AuthRequest, res) => {
    try {
        let { folderId } = req.params;
        const user = req.user!;

        // 깡통 등급(USER) 접근 완전 차단
        if (user.role === 'USER') {
            return res.status(403).json({ success: false, message: "아직 자료실 접근 권한이 부여되지 않았습니다. 관리자의 승인을 기다려주세요." });
        }

        // HOSPITAL_ADMIN 권한 격리
        if (user.role === 'HOSPITAL_ADMIN') {
            const clientFolderId = await getClientDriveFolderId(user.clientId);
            if (!clientFolderId) {
                return res.status(403).json({ success: false, message: "할당된 거래처 폴더가 없습니다." });
            }
            // 최상위 폴더 요청 시 클라이언트 전용 폴더로 강제 매핑
            if (folderId === MASTER_ROOT_FOLDER_ID || folderId === 'root') {
                folderId = clientFolderId;
            }
        } else {
            if (folderId === 'root') {
                folderId = MASTER_ROOT_FOLDER_ID;
            }
        }

        let authOptions: any = {
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        };
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        }
        const auth = new google.auth.GoogleAuth(authOptions);
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, createdTime, webViewLink, iconLink)',
            orderBy: 'folder, createdTime desc', // 폴더 우선 정렬
        });

        res.json({
            success: true,
            files: response.data.files || []
        });
    } catch (error) {
        console.error("Google Drive API Error:", error);
        res.status(500).json({ success: false, message: "구글 드라이브 폴더를 읽어오는 데 실패했습니다." });
    }
});

/**
 * 드라이브 파일 이름 통합 검색
 * GET /api/drive/search?q=검색어
 */
router.get("/search", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const searchQuery = req.query.q as string;
        if (!searchQuery) {
            return res.json({ success: true, files: [] });
        }

        const user = req.user!;
        let q = `name contains '${searchQuery}' and trashed = false`;

        // 깡통 등급(USER) 검색 엔진 접근 원천 차단
        if (user.role === 'USER') {
            return res.status(403).json({ success: false, message: "아직 자료실 검색 권한이 부여되지 않았습니다." });
        }

        // HOSPITAL_ADMIN 권한 격리 (본인 클라이언트 폴더 내 검색으로 한정)
        if (user.role === 'HOSPITAL_ADMIN') {
            const clientFolderId = await getClientDriveFolderId(user.clientId);
            if (!clientFolderId) {
                return res.status(403).json({ success: false, message: "할당된 거래처 폴더가 없습니다." });
            }
            q += ` and '${clientFolderId}' in parents`;
        }

        let authOptions: any = {
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        };
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        }
        const auth = new google.auth.GoogleAuth(authOptions);
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: q,
            fields: 'files(id, name, mimeType, createdTime, webViewLink, iconLink, parents)',
            orderBy: 'createdTime desc',
            pageSize: 50,
        });

        res.json({
            success: true,
            files: response.data.files || []
        });

    } catch (error) {
        console.error("Google Drive Search Error:", error);
        res.status(500).json({ success: false, message: "검색 중 오류가 발생했습니다." });
    }
});

export default router;

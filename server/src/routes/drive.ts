import express from "express";
import { google } from "googleapis";

const router = express.Router();

/**
 * 특정 구글 드라이브 폴더의 파일 목록 조회
 * GET /api/drive/folders/:folderId
 */
router.get("/folders/:folderId", async (req, res) => {
    try {
        const { folderId } = req.params;

        // 환경 변수에 설정된 GOOGLE_APPLICATION_CREDENTIALS JSON 파일을 사용해 자동 인증
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // 폴더 내부의 파일 검색 쿼리
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, createdTime, webViewLink, iconLink)',
            orderBy: 'createdTime desc',
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

export default router;

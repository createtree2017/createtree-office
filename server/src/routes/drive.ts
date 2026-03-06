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
        // 혹은 Railway 배포 환경을 위해 직접 문자열로 주입받은 GOOGLE_CREDENTIALS_JSON 사용
        let authOptions: any = {
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        };

        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        }

        const auth = new google.auth.GoogleAuth(authOptions);

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

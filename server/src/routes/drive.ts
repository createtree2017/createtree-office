import express from "express";
import { google } from "googleapis";
import multer from "multer";
import { Readable } from "stream";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { eq } from "drizzle-orm";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    }
});

const router = express.Router();

const MASTER_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID || '1SI_8POn6S3YqdEcrYIbFSzaU_r2fw5KI'; // 변경된 공유 드라이브 내 "거래처 폴더" ID

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
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
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
 * 드라이브 파일 직접 업로드 (메모리 버퍼 -> 구글 드라이브 스트리밍)
 * POST /api/drive/upload
 */
router.post("/upload", authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
    try {
        const file = req.file;
        let folderId = req.body.folderId;
        const user = req.user!;

        if (!file) {
            return res.status(400).json({ success: false, message: "파일이 첨부되지 않았습니다." });
        }

        if (!folderId) {
            return res.status(400).json({ success: false, message: "업로드할 대상 폴더 ID가 필요합니다." });
        }

        // 권한 체크 (간소화)
        if (user.role === 'USER') {
            return res.status(403).json({ success: false, message: "업로드 권한이 없습니다." });
        }

        if (user.role === 'HOSPITAL_ADMIN') {
            const clientFolderId = await getClientDriveFolderId(user.clientId);
            if (!clientFolderId) {
                return res.status(403).json({ success: false, message: "할당된 거래처 폴더가 없습니다." });
            }
            if (folderId === 'root' || folderId === MASTER_ROOT_FOLDER_ID) {
                folderId = clientFolderId; // 거래처는 루트 업로드 시뮬레이션 시 자신의 폴더로 강제 매핑
            }
        } else {
            if (folderId === 'root') {
                folderId = MASTER_ROOT_FOLDER_ID;
            }
        }

        let authOptions: any = {
            scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
        };
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
        const auth = new google.auth.GoogleAuth(authOptions);
        const drive = google.drive({ version: 'v3', auth });

        // Buffer를 Stream으로 변환
        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: Buffer.from(file.originalname, 'latin1').toString('utf8'), // 한글 깨짐 방지
                parents: [folderId],
            },
            media: {
                mimeType: file.mimetype,
                body: bufferStream,
            },
            fields: 'id, name, webViewLink, iconLink',
            supportsAllDrives: true,
        });

        res.json({
            success: true,
            file: response.data
        });
    } catch (error: any) {
        console.error("Google Drive Upload Error Details:");
        console.error("Error Message:", error.message);
        if (error.response && error.response.data) {
            console.error("API Response Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Raw Error:", error);
        }
        res.status(500).json({ success: false, message: "파일 업로드에 실패했습니다.", error: error.message });
    }
});

/**
 * 드라이브 폴더 내 파일 이름 검색
 * GET /api/drive/search?q=검색어&folderId=폴더ID
 */
router.get("/search", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const searchQuery = req.query.q as string;
        let folderId = req.query.folderId as string;

        if (!searchQuery) {
            return res.json({ success: true, files: [] });
        }

        const user = req.user!;

        // 깡통 등급(USER) 검색 엔진 접근 원천 차단
        if (user.role === 'USER') {
            return res.status(403).json({ success: false, message: "아직 자료실 검색 권한이 부여되지 않았습니다." });
        }

        // HOSPITAL_ADMIN 권한 격리 및 폴더 권한 확인
        if (user.role === 'HOSPITAL_ADMIN') {
            const clientFolderId = await getClientDriveFolderId(user.clientId);
            if (!clientFolderId) {
                return res.status(403).json({ success: false, message: "할당된 거래처 폴더가 없습니다." });
            }
            // folderId가 없거나 루트를 요청하면 클라이언트 루트 폴더로 고정
            if (!folderId || folderId === 'root' || folderId === MASTER_ROOT_FOLDER_ID) {
                folderId = clientFolderId;
            }
        } else {
            // ADMIN인 경우
            if (!folderId || folderId === 'root') {
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

        // 4. folderId 하위의 모든 폴더 ID를 재귀적으로 (BFS) 수집 - 병렬 처리 적용
        let targetFolderIds: string[] = [];
        if (folderId) {
            targetFolderIds.push(folderId);
            let currentLevelIds = [folderId];

            while (currentLevelIds.length > 0) {
                let nextLevelIds: string[] = [];
                // 10개씩 청크 분할
                const chunks = [];
                for (let i = 0; i < currentLevelIds.length; i += 10) {
                    chunks.push(currentLevelIds.slice(i, i + 10));
                }

                // 각 청크별 폴더 검색 프로미스 생성
                const folderPromises = chunks.map(async (chunk) => {
                    const parentQuery = chunk.map(id => `'${id}' in parents`).join(' or ');
                    const query = `(${parentQuery}) and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

                    let pageToken: string | undefined = undefined;
                    const foundIds: string[] = [];
                    do {
                        const driveRes: any = await drive.files.list({
                            q: query,
                            fields: 'nextPageToken, files(id)',
                            pageToken: pageToken,
                            includeItemsFromAllDrives: true,
                            supportsAllDrives: true,
                        });
                        for (const file of driveRes.data.files || []) {
                            if (file.id) {
                                foundIds.push(file.id);
                            }
                        }
                        pageToken = driveRes.data.nextPageToken || undefined;
                    } while (pageToken);
                    return foundIds;
                });

                // 병렬 요청 실행
                const chunkResults = await Promise.all(folderPromises);

                // 결과 수집
                for (const chunkResult of chunkResults) {
                    targetFolderIds.push(...chunkResult);
                    nextLevelIds.push(...chunkResult);
                }

                currentLevelIds = nextLevelIds;
            }
        }

        // 5. 수집된 폴더들 내에서 검색어 매칭되는 파일(폴더 포함) 검색
        let allMatchedFiles: any[] = [];
        let qBase = `name contains '${searchQuery}' and trashed = false`;

        // 폴더 ID가 너무 많은 경우(예: 50개 이상) 드라이브 쿼리가 너무 길어질 수 있으므로 청크 단위로 검색
        if (targetFolderIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < targetFolderIds.length; i += 15) {
                chunks.push(targetFolderIds.slice(i, i + 15));
            }

            // 검색 프로미스 묶음 생성
            const searchPromises = chunks.map(async (chunk) => {
                const parentQuery = chunk.map(id => `'${id}' in parents`).join(' or ');
                const q = `${qBase} and (${parentQuery})`;

                const response = await drive.files.list({
                    q: q,
                    fields: 'files(id, name, mimeType, createdTime, webViewLink, iconLink, parents)',
                    orderBy: 'folder, createdTime desc',
                    pageSize: 100, // 충분히 큰 사이즈
                    includeItemsFromAllDrives: true,
                    supportsAllDrives: true,
                });
                return response.data.files || [];
            });

            // 병렬 동시 검색 실행
            const searchResults = await Promise.all(searchPromises);
            for (const resultFiles of searchResults) {
                allMatchedFiles.push(...resultFiles);
            }
        } else {
            // 루트 전체 검색 (혹시 targetFolderIds가 비었을 때를 대비, 정상 로직에서는 발생 안 함)
            const response = await drive.files.list({
                q: qBase,
                fields: 'files(id, name, mimeType, createdTime, webViewLink, iconLink, parents)',
                orderBy: 'folder, createdTime desc',
                pageSize: 100,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
            });
            if (response.data.files) {
                allMatchedFiles.push(...response.data.files);
            }
        }

        // 파일명 기준 정렬 & 중복제거 (동일 파일이 여러 부모를 가질 경우를 대비)
        const uniqueFilesMap = new Map();
        for (const f of allMatchedFiles) {
            uniqueFilesMap.set(f.id, f);
        }
        allMatchedFiles = Array.from(uniqueFilesMap.values());

        // 정렬: 폴더 상단, 그 외 생성일자 최신순 (이미 orderBy로 되어있지만 부분 병합했으므로 재정렬 필요)
        allMatchedFiles.sort((a, b) => {
            const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
            const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime();
        });

        res.json({
            success: true,
            files: allMatchedFiles
        });

    } catch (error) {
        console.error("Google Drive Search Error:", error);
        res.status(500).json({ success: false, message: "검색 중 오류가 발생했습니다." });
    }
});

export default router;

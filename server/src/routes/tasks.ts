import { Router } from "express";
import { db } from "../db/index.js";
import { tasks, users, clients, taskTemplates, clientServiceContracts } from "../db/schema.js";
import { eq, or, desc, and } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { google } from "googleapis";

const router = Router();
const MASTER_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID || '1G-Wyp42A3OzmwxadzXsiyLIN_TrOFtYz';
const SHARED_DRIVE_ID = process.env.GOOGLE_SHARED_DRIVE_ID || '0AGA9ZFf_x1KWUk9PVA';

// 구글 드라이브 폴더 생성 헬퍼 함수 (Shared Drive 지원)
async function createDriveFolder(folderName: string, parentFolderId: string): Promise<string | null> {
    try {
        let authOptions: any = { scopes: ['https://www.googleapis.com/auth/drive'] };
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
        const auth = new google.auth.GoogleAuth(authOptions);
        const drive = google.drive({ version: 'v3', auth });

        const fileMetadata: any = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
            driveId: SHARED_DRIVE_ID, // Shared Drive에 생성 (서비스 계정 quota 문제 해결)
        };
        const file = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id',
            supportsAllDrives: true,
        });
        console.log(`Drive folder created: "${folderName}" (id: ${file.data.id}) inside parent: ${parentFolderId}`);
        return file.data.id || null;
    } catch (error: any) {
        console.error("Error creating Google Drive folder:", error.message);
        if (error.response?.data) console.error("Details:", JSON.stringify(error.response.data));
        return null;
    }
}



// 업무 목록 조회 (내게 할당된 업무 또는 내가 생성한 업무)
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: "인증 정보가 없습니다." });

        const taskList = await db.select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            dueDate: tasks.dueDate,
            assigneeId: tasks.assigneeId,
            authorId: tasks.authorId,
            templateId: tasks.templateId,
            clientId: tasks.clientId,
            driveFolderId: tasks.driveFolderId,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            assigneeName: users.name,
            templateTitle: taskTemplates.title,
            clientName: clients.name,
        })
            .from(tasks)
            .leftJoin(users, eq(tasks.assigneeId, users.id))
            .leftJoin(taskTemplates, eq(tasks.templateId, taskTemplates.id))
            .leftJoin(clients, eq(tasks.clientId, clients.id))
            .where(or(eq(tasks.assigneeId, userId), eq(tasks.authorId, userId)))
            .orderBy(desc(tasks.updatedAt));

        res.json({ success: true, data: taskList });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "업무 목록 조회 중 오류가 발생했습니다." });
    }
});

// 새 업무 생성 (담당자 지정 포함 및 구글 드라이브 폴더 생성)
router.post("/", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { title, description, status, dueDate, assigneeId, templateId, clientId } = req.body;
        const authorId = req.user?.id;

        if (!authorId) return res.status(401).json({ success: false, message: "인증 정보가 없습니다." });
        if (!title || !assigneeId) {
            return res.status(400).json({ success: false, message: "제목과 담당자를 지정해야 합니다." });
        }

        // 드라이브 폴더 생성 로직:
        // 거래처 + 템플릿 모두 있는 경우 → 계약 템플릿 폴더 하위에 업무폴더 생성
        // 그 외의 경우 → 기존 fallback (거래처폴더 또는 루트폴더 하위)
        let driveFolderId = null;
        if (templateId) {
            let parentDriveFolderId = MASTER_ROOT_FOLDER_ID;

            if (clientId && templateId) {
                // 1순위: 계약 테이블에서 템플릿 폴더 ID 조회
                const [contract] = await db
                    .select()
                    .from(clientServiceContracts)
                    .where(and(
                        eq(clientServiceContracts.clientId, clientId),
                        eq(clientServiceContracts.templateId, templateId)
                    ));

                if (contract?.driveFolderId) {
                    // 계약 템플릿 폴더 하위에 업무 폴더 생성
                    parentDriveFolderId = contract.driveFolderId;
                    console.log(`📁 [Tasks] 업무 폴더 생성 위치: 템플릿폴더(${contract.driveFolderId}) 하위`);
                } else {
                    // 2순위: 계약은 있으나 드라이브폴더 없으면 거래처 폴더 하위
                    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
                    if (client?.driveFolderId) {
                        parentDriveFolderId = client.driveFolderId;
                        console.log(`📁 [Tasks] 거래처 폴더 하위에 업무 폴더 생성 (fallback)`);
                    }
                }
            } else if (clientId) {
                // 템플릿 없으면 거래처 폴더 하위
                const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
                if (client?.driveFolderId) parentDriveFolderId = client.driveFolderId;
            }

            console.log(`Creating Drive folder: "${title}" inside parent: ${parentDriveFolderId}`);
            driveFolderId = await createDriveFolder(title, parentDriveFolderId);
        }

        const [newTask] = await db.insert(tasks).values({
            title,
            description: description || null,
            status: status || "PENDING",
            dueDate: dueDate ? new Date(dueDate) : null,
            assigneeId,
            authorId,
            templateId: templateId || null,
            clientId: clientId || null,
            driveFolderId,
        }).returning();

        res.status(201).json({
            success: true,
            data: newTask,
            message: driveFolderId ? "업무 및 드라이브 폴더가 생성되었습니다." : undefined
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "업무 생성 중 오류가 발생했습니다.", error: error.message });
    }
});

// 단일 업무 상세 (렌더링 용)
router.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const [task] = await db.select({
            task: tasks,
            template: taskTemplates,
            client: clients
        })
            .from(tasks)
            .leftJoin(taskTemplates, eq(tasks.templateId, taskTemplates.id))
            .leftJoin(clients, eq(tasks.clientId, clients.id))
            .where(eq(tasks.id, parseInt(id)));

        if (!task) {
            return res.status(404).json({ success: false, message: "업무를 찾을 수 없습니다." });
        }

        res.json({ success: true, data: task });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "상세 조회 중 오류 발생" });
    }
});

// 업무 상태 및 정보 수정
router.patch("/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { title, description, status, dueDate, assigneeId } = req.body;
        const userId = req.user?.id;

        const [task] = await db.select().from(tasks).where(eq(tasks.id, parseInt(id)));
        if (!task) {
            return res.status(404).json({ success: false, message: "업무를 찾을 수 없습니다." });
        }

        // 작성자 또는 담당자만 수정 가능
        if (task.authorId !== userId && task.assigneeId !== userId && req.user?.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
        }

        const [updatedTask] = await db.update(tasks)
            .set({
                title: title ?? task.title,
                description: description ?? task.description,
                status: status ?? task.status,
                dueDate: dueDate ? new Date(dueDate) : task.dueDate,
                assigneeId: assigneeId ?? task.assigneeId,
                updatedAt: new Date(),
            })
            .where(eq(tasks.id, parseInt(id)))
            .returning();

        // 업무 제목이 변경되고 드라이브 폴더가 연결된 경우 → 드라이브 폴더명 동기화
        if (title && title !== task.title && task.driveFolderId) {
            try {
                let authOptions: any = { scopes: ['https://www.googleapis.com/auth/drive'] };
                if (process.env.GOOGLE_CREDENTIALS_JSON) {
                    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
                } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
                }
                const auth = new google.auth.GoogleAuth(authOptions);
                const drive = google.drive({ version: 'v3', auth });
                await drive.files.update({
                    fileId: task.driveFolderId,
                    requestBody: { name: title },
                    supportsAllDrives: true,
                });
                console.log(`✏️ 드라이브 폴더명 동기화: "${task.title}" → "${title}" (${task.driveFolderId})`);
            } catch (driveErr: any) {
                // 드라이브 동기화 실패는 업무 수정 성공에 영향 주지 않음 (경고만 로깅)
                console.warn(`⚠️ 드라이브 폴더명 동기화 실패 (업무 수정은 완료):`, driveErr.message);
            }
        }

        res.json({ success: true, data: updatedTask });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "업무 수정 중 오류가 발생했습니다." });
    }
});

// 업무 삭제
router.delete("/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const [task] = await db.select().from(tasks).where(eq(tasks.id, parseInt(id)));
        if (!task) {
            return res.status(404).json({ success: false, message: "업무를 찾을 수 없습니다." });
        }

        // 작성자 또는 ADMIN만 삭제 가능
        if (task.authorId !== userId && req.user?.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: "삭제 권한이 없습니다. 작성자나 관리자만 삭제할 수 있습니다." });
        }

        await db.delete(tasks).where(eq(tasks.id, parseInt(id)));

        res.json({ success: true, message: "업무가 성공적으로 삭제되었습니다." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "업무 삭제 중 오류가 발생했습니다." });
    }
});

export default router;

import { Router } from "express";
import { db } from "../db/index.js";
import { tasks, users } from "../db/schema.js";
import { eq, or, desc } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

const router = Router();

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
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            assigneeName: users.name,
        })
            .from(tasks)
            .leftJoin(users, eq(tasks.assigneeId, users.id))
            .where(or(eq(tasks.assigneeId, userId), eq(tasks.authorId, userId)))
            .orderBy(desc(tasks.updatedAt));

        res.json({ success: true, data: taskList });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "업무 목록 조회 중 오류가 발생했습니다." });
    }
});

// 새 업무 생성 (담당자 지정 포함)
router.post("/", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { title, description, status, dueDate, assigneeId } = req.body;
        const authorId = req.user?.id;

        if (!authorId) return res.status(401).json({ success: false, message: "인증 정보가 없습니다." });
        if (!title || !assigneeId) {
            return res.status(400).json({ success: false, message: "제목과 담당자를 지정해야 합니다." });
        }

        const [newTask] = await db.insert(tasks).values({
            title,
            description,
            status: status || "PENDING",
            dueDate: dueDate ? new Date(dueDate) : null,
            assigneeId,
            authorId,
        }).returning();

        res.status(201).json({ success: true, data: newTask });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "업무 생성 중 오류가 발생했습니다.", error: error.message });
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

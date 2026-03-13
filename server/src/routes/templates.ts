import express from "express";
import { db } from "../db/index.js";
import { taskTemplates, users, tasks, clientServiceContracts } from "../db/schema.js";
import { eq, count, notInArray } from "drizzle-orm";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// 모든 템플릿 목록 조회
router.get("/", authenticateToken, async (req, res) => {
    try {
        const templates = await db
            .select({
                id: taskTemplates.id,
                title: taskTemplates.title,
                description: taskTemplates.description,
                formSchema: taskTemplates.formSchema,
                createdAt: taskTemplates.createdAt,
                updatedAt: taskTemplates.updatedAt,
                authorName: users.name,
            })
            .from(taskTemplates)
            .leftJoin(users, eq(taskTemplates.authorId, users.id))
            .orderBy(taskTemplates.createdAt);

        res.json(templates);
    } catch (error) {
        console.error("Error fetching templates:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

// 단일 템플릿 상세 조회
router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const template = await db
            .select()
            .from(taskTemplates)
            .where(eq(taskTemplates.id, parseInt(id)))
            .limit(1);

        if (!template || template.length === 0) {
            return res.status(404).json({ message: "템플릿을 찾을 수 없습니다." });
        }

        res.json(template[0]);
    } catch (error) {
        console.error("Error fetching template:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

// 템플릿에 연결된 업무 목록 조회 (삭제 전 확인용)
router.get("/:id/linked-tasks", authenticateToken, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const linkedTasks = await db
            .select({
                id: tasks.id,
                title: tasks.title,
                status: tasks.status,
                dueDate: tasks.dueDate,
            })
            .from(tasks)
            .where(eq(tasks.templateId, templateId));

        res.json({ tasks: linkedTasks, count: linkedTasks.length });
    } catch (error) {
        console.error("Error fetching linked tasks:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

// 템플릿 생성 (관리자 전용 고려 - authMiddleware의 req.user 확장 필요)
router.post("/", authenticateToken, async (req: any, res) => {
    try {
        const { title, description, formSchema } = req.body;
        const authorId = req.user.id; // auth 미들웨어에서 가져옴

        const newTemplate = await db.insert(taskTemplates).values({
            title,
            description,
            formSchema,
            authorId,
        }).returning();

        res.status(201).json(newTemplate[0]);
    } catch (error) {
        console.error("Error creating template:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

// 템플릿 수정
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, formSchema } = req.body;

        const updatedTemplate = await db.update(taskTemplates).set({
            title,
            description,
            formSchema,
            updatedAt: new Date(),
        }).where(eq(taskTemplates.id, parseInt(id))).returning();

        if (!updatedTemplate || updatedTemplate.length === 0) {
            return res.status(404).json({ message: "템플릿을 찾을 수 없습니다." });
        }

        res.json(updatedTemplate[0]);
    } catch (error) {
        console.error("Error updating template:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

// 템플릿 삭제 (연결된 업무 함께 삭제)
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const templateId = parseInt(id);

        // 연결된 업무 수 확인 (응답에 포함해서 프론트에서 confirm 활용 가능)
        const [{ linkedTaskCount }] = await db
            .select({ linkedTaskCount: count() })
            .from(tasks)
            .where(eq(tasks.templateId, templateId));

        // 연결된 업무 먼저 삭제 (캐스케이드)
        if (linkedTaskCount > 0) {
            await db.delete(tasks).where(eq(tasks.templateId, templateId));
        }

        // 템플릿 삭제
        await db.delete(taskTemplates).where(eq(taskTemplates.id, templateId));

        res.json({
            message: linkedTaskCount > 0
                ? `템플릿과 연결된 업무 ${linkedTaskCount}건이 함께 삭제되었습니다.`
                : "템플릿이 삭제되었습니다."
        });
    } catch (error) {
        console.error("Error deleting template:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

export default router;

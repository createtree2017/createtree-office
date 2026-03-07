import express from "express";
import { db } from "../db/index.js";
import { taskResponses, tasks } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

// 내 임시저장 데이터 및 기존 응답 가져오기
router.get("/:taskId", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user!.id;

        const response = await db
            .select()
            .from(taskResponses)
            .where(
                and(
                    eq(taskResponses.taskId, parseInt(taskId)),
                    eq(taskResponses.submitterId, userId)
                )
            )
            .limit(1);

        if (!response || response.length === 0) {
            return res.json(null); // 아직 응답/임시저장이 없음
        }

        res.json(response[0]);
    } catch (error) {
        console.error("Error fetching task response:", error);
        res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
});

// 임시저장 (Draft) 로직
router.put("/:taskId/draft", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { taskId } = req.params;
        const { responseData } = req.body;
        const submitterId = req.user!.id;

        // 이미 있는지 확인
        const existing = await db
            .select()
            .from(taskResponses)
            .where(
                and(
                    eq(taskResponses.taskId, parseInt(taskId)),
                    eq(taskResponses.submitterId, submitterId)
                )
            )
            .limit(1);

        let savedResponse;
        if (existing.length > 0) {
            // 업데이트
            const updated = await db.update(taskResponses)
                .set({
                    responseData,
                    updatedAt: new Date(),
                })
                .where(eq(taskResponses.id, existing[0].id))
                .returning();
            savedResponse = updated[0];
        } else {
            // 새로 생성
            const inserted = await db.insert(taskResponses).values({
                taskId: parseInt(taskId),
                submitterId,
                responseData,
                status: "DRAFT",
            }).returning();
            savedResponse = inserted[0];
        }

        // 상태 연동 - task 도 IN_PROGRESS 로 변경
        await db.update(tasks)
            .set({ status: "IN_PROGRESS", updatedAt: new Date() })
            .where(eq(tasks.id, parseInt(taskId)));

        res.json({ success: true, message: "임시저장 완료", data: savedResponse });
    } catch (error) {
        console.error("Error saving draft:", error);
        res.status(500).json({ message: "임시저장 중 오류가 발생했습니다." });
    }
});

// 최종 제출 (Submit) 
router.post("/:taskId/submit", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { taskId } = req.params;
        const { responseData } = req.body;
        const submitterId = req.user!.id;

        // 이미 있는지 확인
        const existing = await db
            .select()
            .from(taskResponses)
            .where(
                and(
                    eq(taskResponses.taskId, parseInt(taskId)),
                    eq(taskResponses.submitterId, submitterId)
                )
            )
            .limit(1);

        let savedResponse;
        if (existing.length > 0) {
            const updated = await db.update(taskResponses)
                .set({
                    responseData,
                    status: "SUBMITTED",
                    updatedAt: new Date(),
                })
                .where(eq(taskResponses.id, existing[0].id))
                .returning();
            savedResponse = updated[0];
        } else {
            const inserted = await db.insert(taskResponses).values({
                taskId: parseInt(taskId),
                submitterId,
                responseData,
                status: "SUBMITTED",
            }).returning();
            savedResponse = inserted[0];
        }

        // 인스턴스 상태도 완료로 변경
        await db.update(tasks)
            .set({ status: "COMPLETED", updatedAt: new Date() })
            .where(eq(tasks.id, parseInt(taskId)));

        res.json({ success: true, message: "최종 제출이 완료되었습니다.", data: savedResponse });
    } catch (error) {
        console.error("Error submitting response:", error);
        res.status(500).json({ message: "제출 중 오류가 발생했습니다." });
    }
});

export default router;

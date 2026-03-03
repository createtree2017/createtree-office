import { Router } from "express";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq, not } from "drizzle-orm";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";

const router = Router();

// 모든 사용자 목록 조회 (관리자 전용)
router.get("/users", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const allUsers = await db.select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            isApproved: users.isApproved,
            createdAt: users.createdAt,
        }).from(users);

        res.json({ success: true, data: allUsers });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "사용자 목록을 불러오지 못했습니다." });
    }
});

// 사용자 등급 및 승인 상태 변경
router.patch("/users/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { id } = req.params;
        const { role, isApproved } = req.body;

        const [updatedUser] = await db.update(users)
            .set({
                role: role ?? undefined,
                isApproved: isApproved !== undefined ? isApproved : undefined,
                updatedAt: new Date()
            })
            .where(eq(users.id, parseInt(id)))
            .returning();

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
        }

        res.json({ success: true, data: updatedUser });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "수정 중 오류가 발생했습니다." });
    }
});

export default router;

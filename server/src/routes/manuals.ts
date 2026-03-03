import { Router } from "express";
import { db } from "../db/index.js";
import { manuals } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { authenticateToken } from "../middleware/auth.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// 모든 승인된 사용자는 매뉴얼 목록 조회 가능
router.get("/", authenticateToken, async (req, res) => {
    try {
        const list = await db.select().from(manuals).orderBy(desc(manuals.updatedAt));
        res.json({ success: true, data: list });
    } catch (error: any) {
        res.status(500).json({ success: true, message: "목록 조회 중 오류가 발생했습니다." });
    }
});

// 매뉴얼 생성 (Manager 이상)
router.post("/", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { title, content, minRoleToEdit } = req.body;
        const userRole = req.user?.role || "USER";

        if (userRole === "USER") {
            return res.status(403).json({ success: false, message: "매뉴얼을 생성할 권한이 없습니다." });
        }

        const [newManual] = await db.insert(manuals).values({
            title,
            content,
            minRoleToEdit: minRoleToEdit || "MANAGER",
            authorId: req.user?.id as any,
        }).returning();

        res.status(201).json({ success: true, data: newManual });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "생성 중 오류가 발생했습니다.", error: error.message });
    }
});

// 매뉴얼 상세 조회
router.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const [manual] = await db.select().from(manuals).where(eq(manuals.id, parseInt(id)));

        if (!manual) {
            return res.status(404).json({ success: false, message: "매뉴얼을 찾을 수 없습니다." });
        }

        res.json({ success: true, data: manual });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "조회 중 오류가 발생했습니다." });
    }
});

// 매뉴얼 수정 (권한 체크 포함)
router.patch("/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        const userRole = req.user?.role || "USER";

        const [manual] = await db.select().from(manuals).where(eq(manuals.id, parseInt(id)));
        if (!manual) {
            return res.status(404).json({ success: false, message: "매뉴얼을 찾을 수 없습니다." });
        }

        // Role Hierarchy: ADMIN > MANAGER > USER
        const roles = ["USER", "MANAGER", "ADMIN"];
        const userWeight = roles.indexOf(userRole);
        const requiredWeight = roles.indexOf(manual.minRoleToEdit);

        if (userWeight < requiredWeight) {
            return res.status(403).json({ success: false, message: "해당 매뉴얼을 수정할 권한이 없습니다." });
        }

        const [updated] = await db.update(manuals)
            .set({
                title: title ?? manual.title,
                content: content ?? manual.content,
                updatedAt: new Date()
            })
            .where(eq(manuals.id, parseInt(id)))
            .returning();

        res.json({ success: true, data: updated });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "저장 중 오류가 발생했습니다." });
    }
});

export default router;

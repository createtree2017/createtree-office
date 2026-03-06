import { Router } from "express";
import { db } from "../db/index.js";
import { manuals } from "../db/schema.js";
import { eq, desc, asc, sql } from "drizzle-orm";
import { authenticateToken } from "../middleware/auth.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// 모든 승인된 사용자는 매뉴얼 목록 조회 가능 (정렬 순서 적용)
router.get("/", authenticateToken, async (req, res) => {
    try {
        const list = await db.select().from(manuals).orderBy(asc(manuals.order), desc(manuals.updatedAt));
        res.json({ success: true, data: list });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "목록 조회 중 오류가 발생했습니다.", error: error.message });
    }
});

// 매뉴얼 생성 (Manager 이상)
router.post("/", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { title, content, minRoleToEdit, parentId, type, icon, order } = req.body;
        const userRole = req.user?.role || "USER";

        if (userRole === "USER") {
            return res.status(403).json({ success: false, message: "매뉴얼을 생성할 권한이 없습니다." });
        }

        const [newManual] = await db.insert(manuals).values({
            title,
            content,
            minRoleToEdit: minRoleToEdit || "MANAGER",
            authorId: req.user?.id as any,
            parentId: parentId || null,
            type: type || "PAGE",
            icon: icon || null,
            order: order || 0,
            googleFormId: req.body.googleFormId || null,
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
        const { title, content, parentId, type, icon, order } = req.body;
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
                parentId: parentId !== undefined ? parentId : manual.parentId,
                type: type ?? manual.type,
                icon: icon ?? manual.icon,
                order: order ?? manual.order,
                googleFormId: req.body.googleFormId !== undefined ? req.body.googleFormId : manual.googleFormId,
                updatedAt: new Date()
            })
            .where(eq(manuals.id, parseInt(id)))
            .returning();

        res.json({ success: true, data: updated });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "저장 중 오류가 발생했습니다." });
    }
});

// 매뉴얼/폴더 삭제 (ADMIN 또는 MANAGER만 가능)
router.delete("/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const userRole = req.user?.role || "USER";

        if (userRole === "USER") {
            return res.status(403).json({ success: false, message: "삭제 권한이 없습니다." });
        }

        const [manual] = await db.select().from(manuals).where(eq(manuals.id, parseInt(id)));
        if (!manual) {
            return res.status(404).json({ success: false, message: "매뉴얼을 찾을 수 없습니다." });
        }

        // 하위 항목이 있는 폴더는 하위 항목 먼저 삭제 (재귀)
        const deleteWithChildren = async (nodeId: number) => {
            const children = await db.select().from(manuals).where(eq(manuals.parentId, nodeId));
            for (const child of children) {
                await deleteWithChildren(child.id);
            }
            await db.delete(manuals).where(eq(manuals.id, nodeId));
        };

        await deleteWithChildren(parseInt(id));

        res.json({ success: true, message: "삭제되었습니다." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "삭제 중 오류가 발생했습니다.", error: error.message });
    }
});

export default router;

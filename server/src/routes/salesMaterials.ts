import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { salesMaterials } from "../db/schema.js";
import { authenticateToken, authorizeRole, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === "true";
        const rows = await db.select().from(salesMaterials).orderBy(desc(salesMaterials.updatedAt));
        res.json({ success: true, data: includeInactive ? rows : rows.filter(row => row.isActive) });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "영업자료 목록 조회 실패" });
    }
});

router.post("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    try {
        const { title, materialType, description, driveFileId, driveFileName, driveWebViewLink, externalUrl, version } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "자료명이 필요합니다." });
        const [created] = await db.insert(salesMaterials).values({
            title,
            materialType: materialType || "company_intro",
            description: description || null,
            driveFileId: driveFileId || null,
            driveFileName: driveFileName || null,
            driveWebViewLink: driveWebViewLink || null,
            externalUrl: externalUrl || null,
            version: version || "v1",
            createdBy: req.user!.id,
        }).returning();
        res.status(201).json({ success: true, data: created, message: "영업자료가 등록되었습니다." });
    } catch (error: any) {
        console.error("영업자료 등록 오류:", error);
        res.status(500).json({ success: false, message: "영업자료 등록 실패" });
    }
});

router.patch("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const allowed = ["title", "materialType", "description", "driveFileId", "driveFileName", "driveWebViewLink", "externalUrl", "version", "isActive"];
        const updateData: any = { updatedAt: new Date() };
        for (const key of allowed) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }
        const [updated] = await db.update(salesMaterials).set(updateData).where(eq(salesMaterials.id, id)).returning();
        if (!updated) return res.status(404).json({ success: false, message: "영업자료를 찾을 수 없습니다." });
        res.json({ success: true, data: updated });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "영업자료 수정 실패" });
    }
});

router.delete("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        await db.update(salesMaterials).set({ isActive: false, updatedAt: new Date() }).where(eq(salesMaterials.id, id));
        res.json({ success: true, message: "영업자료를 비활성화했습니다." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "영업자료 삭제 실패" });
    }
});

export default router;

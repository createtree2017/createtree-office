import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { marketResearchItems, salesActivities, salesLeads } from "../db/schema.js";
import { authenticateToken, authorizeRole, AuthRequest } from "../middleware/auth.js";

const router = Router();

function toArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

async function buildLeadRows(query: any) {
    const statuses = toArray(query.status || query.statuses);
    const businessTypes = toArray(query.businessType || query.businessTypes);
    const regions = toArray(query.region || query.regions);
    const leads = await db.select().from(salesLeads).where(eq(salesLeads.isArchived, false)).orderBy(desc(salesLeads.updatedAt));
    const items = await db.select().from(marketResearchItems);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    return leads
        .map((lead) => ({ ...lead, item: itemMap.get(lead.marketResearchItemId) || null }))
        .filter((lead: any) => {
            if (!lead.item) return false;
            if (statuses.length > 0 && !statuses.includes("all") && !statuses.includes(lead.status)) return false;
            if (businessTypes.length > 0 && !businessTypes.includes("all") && !businessTypes.includes(lead.item.businessType)) return false;
            if (regions.length > 0 && !regions.includes("all") && !regions.includes("전국") && !regions.includes(lead.item.region) && !regions.includes(lead.item.city)) return false;
            const q = String(query.q || "").trim().toLowerCase();
            if (q && ![lead.item.name, lead.item.address, lead.item.phone, lead.item.email, lead.notes].some((v: any) => String(v || "").toLowerCase().includes(q))) return false;
            return true;
        });
}

router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const data = await buildLeadRows(req.query);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("영업선택업체 목록 오류:", error);
        res.status(500).json({ success: false, message: "영업선택업체 목록을 불러오지 못했습니다." });
    }
});

router.get("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const [lead] = await db.select().from(salesLeads).where(eq(salesLeads.id, id));
        if (!lead || lead.isArchived) return res.status(404).json({ success: false, message: "영업선택업체를 찾을 수 없습니다." });
        const [item] = await db.select().from(marketResearchItems).where(eq(marketResearchItems.id, lead.marketResearchItemId));
        const activities = await db.select().from(salesActivities)
            .where(eq(salesActivities.salesLeadId, id))
            .orderBy(desc(salesActivities.activityDate));
        res.json({ success: true, data: { ...lead, item, activities } });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "영업선택업체 상세 조회 실패" });
    }
});

router.patch("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const [existing] = await db.select().from(salesLeads).where(eq(salesLeads.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "영업선택업체를 찾을 수 없습니다." });

        const allowed = [
            "status",
            "ownerId",
            "clientId",
            "contactConsentStatus",
            "contactPerson",
            "contactRole",
            "nextAction",
            "nextActionDate",
            "notes",
            "isArchived",
        ];
        const updateData: any = { updatedAt: new Date() };
        for (const key of allowed) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key] || null;
        }
        const [updated] = await db.update(salesLeads).set(updateData).where(eq(salesLeads.id, id)).returning();
        res.json({ success: true, data: updated });
    } catch (error: any) {
        console.error("영업선택업체 수정 오류:", error);
        res.status(500).json({ success: false, message: "영업선택업체 수정 실패" });
    }
});

router.post("/:id/activities", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const [lead] = await db.select().from(salesLeads).where(eq(salesLeads.id, id));
        if (!lead || lead.isArchived) return res.status(404).json({ success: false, message: "영업선택업체를 찾을 수 없습니다." });

        const { activityType, channel, subject, content, outcome, nextAction, nextActionDate, attachments } = req.body;
        if (!activityType) return res.status(400).json({ success: false, message: "활동 유형이 필요합니다." });

        const [activity] = await db.insert(salesActivities).values({
            salesLeadId: id,
            activityType,
            channel: channel || null,
            subject: subject || null,
            content: content || null,
            outcome: outcome || null,
            nextAction: nextAction || null,
            nextActionDate: nextActionDate ? new Date(nextActionDate) : null,
            attachments: attachments || [],
            createdBy: req.user!.id,
        }).returning();

        const updateData: any = { updatedAt: new Date() };
        if (nextAction !== undefined) updateData.nextAction = nextAction || null;
        if (nextActionDate !== undefined) updateData.nextActionDate = nextActionDate ? new Date(nextActionDate) : null;
        await db.update(salesLeads).set(updateData).where(eq(salesLeads.id, id));

        res.status(201).json({ success: true, data: activity, message: "영업활동을 기록했습니다." });
    } catch (error: any) {
        console.error("영업활동 기록 오류:", error);
        res.status(500).json({ success: false, message: "영업활동 기록 실패" });
    }
});

router.delete("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const [lead] = await db.update(salesLeads).set({ isArchived: true, updatedAt: new Date() })
            .where(eq(salesLeads.id, id))
            .returning();
        if (lead) {
            await db.update(marketResearchItems).set({ isSelected: false, updatedAt: new Date() })
                .where(eq(marketResearchItems.id, lead.marketResearchItemId));
        }
        res.json({ success: true, message: "영업선택업체를 목록에서 제외했습니다." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "영업선택업체 제외 실패" });
    }
});

export default router;

import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { marketResearchItems, salesActivities, salesLeads, salesMaterials, salesMessages } from "../db/schema.js";
import { authenticateToken, authorizeRole, AuthRequest } from "../middleware/auth.js";
import { isSalesEmailSendingEnabled, sendSalesEmail } from "../services/sales/emailDeliveryService.js";

const router = Router();

function applyTemplate(value: string, item: any, lead: any): string {
    return value
        .replaceAll("{병원명}", item?.name || "")
        .replaceAll("{지역}", item?.region || "")
        .replaceAll("{담당자}", lead?.contactPerson || "담당자님");
}

function buildMaterialHtml(materials: any[]): string {
    if (materials.length === 0) return "";
    const links = materials
        .map((material) => {
            const url = material.driveWebViewLink || material.externalUrl || (material.driveFileId ? `https://drive.google.com/file/d/${material.driveFileId}/view` : "");
            return url ? `<li><a href="${url}">${material.title} ${material.version || ""}</a></li>` : `<li>${material.title} ${material.version || ""}</li>`;
        })
        .join("");
    return `<hr><p><strong>첨부/참고 자료</strong></p><ul>${links}</ul>`;
}

router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const rows = await db.select().from(salesMessages).orderBy(desc(salesMessages.createdAt));
        const leadId = req.query.salesLeadId ? parseInt(req.query.salesLeadId as string) : null;
        res.json({ success: true, data: leadId ? rows.filter(row => row.salesLeadId === leadId) : rows });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "발송 이력 조회 실패" });
    }
});

router.post("/send", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    try {
        const leadIds: number[] = Array.isArray(req.body.leadIds) ? req.body.leadIds.map(Number).filter(Boolean) : [];
        const materialIds: number[] = Array.isArray(req.body.materialIds) ? req.body.materialIds.map(Number).filter(Boolean) : [];
        const subject = String(req.body.subject || "").trim();
        const body = String(req.body.body || "").trim();

        if (leadIds.length === 0) return res.status(400).json({ success: false, message: "발송할 영업선택업체가 필요합니다." });
        if (!subject || !body) return res.status(400).json({ success: false, message: "메일 제목과 본문이 필요합니다." });

        const leads = (await db.select().from(salesLeads).where(eq(salesLeads.isArchived, false))).filter(lead => leadIds.includes(lead.id));
        const items = await db.select().from(marketResearchItems);
        const materials = (await db.select().from(salesMaterials).where(eq(salesMaterials.isActive, true))).filter(material => materialIds.includes(material.id));
        const itemById = new Map(items.map(item => [item.id, item]));
        const materialHtml = buildMaterialHtml(materials);
        const emailSendingEnabled = isSalesEmailSendingEnabled();

        const results = [];
        for (const lead of leads) {
            const item = itemById.get(lead.marketResearchItemId);
            const recipients = item?.email ? [item.email] : [];
            let status: "draft" | "blocked" | "sent" | "failed" = "draft";
            let blockedReason: string | null = null;
            let providerMessageId: string | null = null;
            let errorMessage: string | null = null;
            let sentAt: Date | null = null;

            if (!item) {
                status = "blocked";
                blockedReason = "연결된 시장조사 항목이 없습니다.";
            } else if (item.operationStatus === "closed") {
                status = "blocked";
                blockedReason = "폐업 업체는 발송할 수 없습니다.";
            } else if (!item.email) {
                status = "blocked";
                blockedReason = "대표 이메일이 없습니다.";
            } else if (lead.status === "unsubscribed" || lead.contactConsentStatus === "unsubscribed") {
                status = "blocked";
                blockedReason = "수신거부 업체입니다.";
            } else if (!emailSendingEnabled) {
                status = "draft";
                blockedReason = "Resend 발송 설정이 없어 초안 기록으로 저장했습니다.";
            } else {
                const htmlBody = `${applyTemplate(body, item, lead).replace(/\n/g, "<br>")}${materialHtml}<hr><p style="font-size:12px;color:#666">수신을 원하지 않으시면 회신으로 수신거부 의사를 알려주세요.</p>`;
                const sendResult = await sendSalesEmail({
                    to: recipients,
                    subject: applyTemplate(subject, item, lead),
                    html: htmlBody,
                });
                if (sendResult.messageId) {
                    status = "sent";
                    providerMessageId = sendResult.messageId;
                    sentAt = new Date();
                } else {
                    status = sendResult.enabled ? "failed" : "draft";
                    errorMessage = sendResult.error || null;
                    blockedReason = sendResult.enabled ? null : sendResult.error || null;
                }
            }

            const [message] = await db.insert(salesMessages).values({
                salesLeadId: lead.id,
                recipients,
                subject: item ? applyTemplate(subject, item, lead) : subject,
                body: item ? applyTemplate(body, item, lead) : body,
                materialIds,
                status,
                blockedReason,
                channel: "resend",
                providerMessageId,
                errorMessage,
                sentAt,
                createdBy: req.user!.id,
            }).returning();

            await db.insert(salesActivities).values({
                salesLeadId: lead.id,
                activityType: "email",
                channel: "resend",
                subject: message.subject,
                content: message.body,
                outcome: status === "sent" ? "발송완료" : status === "blocked" ? `발송차단: ${blockedReason}` : "초안/대기 기록",
                attachments: materials.map(material => ({ id: material.id, title: material.title })),
                createdBy: req.user!.id,
            });

            if (status === "sent") {
                await db.update(salesLeads).set({ status: "material_sent", updatedAt: new Date() }).where(eq(salesLeads.id, lead.id));
            }
            results.push(message);
        }

        res.status(201).json({ success: true, data: results, message: `${results.length}건의 발송 작업을 기록했습니다.` });
    } catch (error: any) {
        console.error("영업자료 발송 오류:", error);
        res.status(500).json({ success: false, message: "영업자료 발송 처리 실패", detail: error.message });
    }
});

export default router;

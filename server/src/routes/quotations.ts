import { Router } from "express";
import { db } from "../db/index.js";
import {
    quotations,
    quotationItems,
    quotationServiceConfigs,
    clients,
    users,
    contractDiscountPolicies,
} from "../db/schema.js";
import { eq, asc, desc } from "drizzle-orm";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";

const router = Router();

// ────────────────────────────────────────────
// 헬퍼: 견적 번호 자동 채번 (QT-YYYYMMDD-NNN)
// ────────────────────────────────────────────
async function generateQuotationNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `QT-${dateStr}-`;

    const existing = await db.select()
        .from(quotations)
        .where(eq(quotations.quotationNumber, prefix)) // just to check pattern, not exact
        .orderBy(desc(quotations.id));

    // 오늘 날짜의 마지막 번호 찾기
    const allToday = await db.select({ qn: quotations.quotationNumber })
        .from(quotations);
    const todayNumbers = allToday
        .filter(q => q.qn.startsWith(prefix))
        .map(q => parseInt(q.qn.replace(prefix, '')) || 0);

    const nextNum = todayNumbers.length > 0 ? Math.max(...todayNumbers) + 1 : 1;
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

// ────────────────────────────────────────────
// 헬퍼: 견적서 상세 조회 (items, serviceConfigs, 거래처명, 작성자명 포함)
// ────────────────────────────────────────────
async function getQuotationWithDetails(quotationId: number) {
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
    if (!quotation) return null;

    // 거래처명
    let clientName = '';
    if (quotation.clientId) {
        const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, quotation.clientId));
        clientName = client?.name || '';
    }

    // 작성자명
    let createdByName = '';
    if (quotation.createdBy) {
        const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, quotation.createdBy));
        createdByName = user?.name || '';
    }

    const items = await db.select()
        .from(quotationItems)
        .where(eq(quotationItems.quotationId, quotationId))
        .orderBy(asc(quotationItems.sortOrder));

    const serviceConfigs = await db.select()
        .from(quotationServiceConfigs)
        .where(eq(quotationServiceConfigs.quotationId, quotationId));

    return { ...quotation, clientName, createdByName, items, serviceConfigs };
}

// ────────────────────────────────────────────
// GET /api/quotations
// ────────────────────────────────────────────
router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const allQuotations = await db.select()
            .from(quotations)
            .orderBy(desc(quotations.createdAt));

        // 각 견적서에 거래처명 추가
        const result = await Promise.all(
            allQuotations.map(async (q) => {
                let clientName = '';
                if (q.clientId) {
                    const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, q.clientId));
                    clientName = client?.name || '';
                }
                let createdByName = '';
                if (q.createdBy) {
                    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, q.createdBy));
                    createdByName = user?.name || '';
                }
                return { ...q, clientName, createdByName };
            })
        );

        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error("견적서 목록 조회 오류:", error);
        res.status(500).json({ success: false, message: "견적서 목록 조회 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// GET /api/quotations/:id
// ────────────────────────────────────────────
router.get("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const quotation = await getQuotationWithDetails(id);
        if (!quotation) return res.status(404).json({ success: false, message: "견적서를 찾을 수 없습니다." });

        res.json({ success: true, data: quotation });
    } catch (error: any) {
        console.error("견적서 상세 조회 오류:", error);
        res.status(500).json({ success: false, message: "견적서 상세 조회 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// POST /api/quotations
// ────────────────────────────────────────────
router.post("/", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { clientId, title, contractMonths, discountPolicyId, discountApplied,
            subtotal, discountAmount, totalAmount, monthlyAmount,
            notes, validUntil, items, serviceConfigs } = req.body;

        if (!clientId || !title || (contractMonths === undefined || contractMonths === null)) {
            return res.status(400).json({ success: false, message: "clientId, title, contractMonths는 필수입니다." });
        }

        const quotationNumber = await generateQuotationNumber();
        const userId = (req as any).user?.id || null;

        // 1. 견적서 생성
        const [newQuotation] = await db.insert(quotations).values({
            quotationNumber,
            clientId,
            title,
            contractMonths,
            discountPolicyId: discountPolicyId || null,
            discountApplied: discountApplied || false,
            subtotal: subtotal || 0,
            discountAmount: discountAmount || 0,
            totalAmount: totalAmount || 0,
            monthlyAmount: monthlyAmount || 0,
            notes: notes || null,
            status: "draft",
            validUntil: validUntil || null,
            createdBy: userId,
        }).returning();

        // 2. 견적 항목 생성
        if (items && Array.isArray(items)) {
            for (const item of items) {
                await db.insert(quotationItems).values({
                    quotationId: newQuotation.id,
                    serviceId: item.serviceId || null,
                    serviceName: item.serviceName,
                    tierId: item.tierId || null,
                    tierName: item.tierName || null,
                    itemId: item.itemId || null,
                    itemName: item.itemName,
                    itemCategory: item.itemCategory,
                    itemPriceUnit: item.itemPriceUnit,
                    quantity: item.quantity || 1,
                    unitPrice: item.unitPrice,
                    amount: item.amount,
                    isRequired: item.isRequired !== undefined ? item.isRequired : true,
                    paymentMethod: item.paymentMethod || null,
                    sortOrder: item.sortOrder || 0,
                });
            }
        }

        // 3. 서비스별 설정 생성
        if (serviceConfigs && Array.isArray(serviceConfigs)) {
            for (const config of serviceConfigs) {
                await db.insert(quotationServiceConfigs).values({
                    quotationId: newQuotation.id,
                    serviceId: config.serviceId || null,
                    serviceName: config.serviceName,
                    billingType: config.billingType,
                    selectedTierId: config.selectedTierId || null,
                    selectedTierName: config.selectedTierName || null,
                    eventFrequency: config.eventFrequency || null,
                    eventPaymentMethod: config.eventPaymentMethod || null,
                    notes: config.notes || null,
                });
            }
        }

        const full = await getQuotationWithDetails(newQuotation.id);
        res.status(201).json({ success: true, data: full, message: `견적서 ${quotationNumber}이 생성되었습니다.` });
    } catch (error: any) {
        console.error("견적서 생성 오류:", error);
        res.status(500).json({ success: false, message: "견적서 생성 중 오류가 발생했습니다.", detail: error.message });
    }
});

// ────────────────────────────────────────────
// PUT /api/quotations/:id
// ────────────────────────────────────────────
router.put("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [existing] = await db.select().from(quotations).where(eq(quotations.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "견적서를 찾을 수 없습니다." });

        const { clientId, title, contractMonths, discountPolicyId, discountApplied,
            subtotal, discountAmount, totalAmount, monthlyAmount,
            notes, validUntil, items, serviceConfigs } = req.body;

        // 기본 정보 업데이트
        await db.update(quotations).set({
            clientId: clientId || existing.clientId,
            title: title || existing.title,
            contractMonths: contractMonths !== undefined ? contractMonths : existing.contractMonths,
            discountPolicyId: discountPolicyId !== undefined ? discountPolicyId : existing.discountPolicyId,
            discountApplied: discountApplied !== undefined ? discountApplied : existing.discountApplied,
            subtotal: subtotal !== undefined ? subtotal : existing.subtotal,
            discountAmount: discountAmount !== undefined ? discountAmount : existing.discountAmount,
            totalAmount: totalAmount !== undefined ? totalAmount : existing.totalAmount,
            monthlyAmount: monthlyAmount !== undefined ? monthlyAmount : existing.monthlyAmount,
            notes: notes !== undefined ? notes : existing.notes,
            validUntil: validUntil !== undefined ? (validUntil || null) : existing.validUntil,
            updatedAt: new Date(),
        }).where(eq(quotations.id, id));

        // 하위 데이터 동기화
        if (items !== undefined) {
            await db.delete(quotationItems).where(eq(quotationItems.quotationId, id));
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    await db.insert(quotationItems).values({
                        quotationId: id,
                        serviceId: item.serviceId || null,
                        serviceName: item.serviceName,
                        tierId: item.tierId || null,
                        tierName: item.tierName || null,
                        itemId: item.itemId || null,
                        itemName: item.itemName,
                        itemCategory: item.itemCategory || 'service',
                        itemPriceUnit: item.itemPriceUnit || 'per_month',
                        quantity: item.quantity || 1,
                        unitPrice: item.unitPrice || 0,
                        amount: item.amount || 0,
                        isRequired: item.isRequired !== undefined ? item.isRequired : true,
                        paymentMethod: item.paymentMethod || null,
                        sortOrder: item.sortOrder || 0,
                    });
                }
            }
        }

        if (serviceConfigs !== undefined) {
            await db.delete(quotationServiceConfigs).where(eq(quotationServiceConfigs.quotationId, id));
            if (serviceConfigs && Array.isArray(serviceConfigs)) {
                for (const config of serviceConfigs) {
                    await db.insert(quotationServiceConfigs).values({
                        quotationId: id,
                        serviceId: config.serviceId || null,
                        serviceName: config.serviceName,
                        billingType: config.billingType,
                        selectedTierId: config.selectedTierId || null,
                        selectedTierName: config.selectedTierName || null,
                        eventFrequency: config.eventFrequency || null,
                        eventPaymentMethod: config.eventPaymentMethod || null,
                        notes: config.notes || null,
                    });
                }
            }
        }

        const full = await getQuotationWithDetails(id);
        res.json({ success: true, data: full, message: "견적서가 수정되었습니다." });
    } catch (error: any) {
        console.error("견적서 수정 오류:", error);
        res.status(500).json({ success: false, message: "견적서 수정 중 오류가 발생했습니다.", detail: error.message });
    }
});

// ────────────────────────────────────────────
// DELETE /api/quotations/:id
// ────────────────────────────────────────────
router.delete("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [existing] = await db.select().from(quotations).where(eq(quotations.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "견적서를 찾을 수 없습니다." });

        await db.delete(quotations).where(eq(quotations.id, id)); // cascade로 items, configs도 삭제
        res.json({ success: true, message: `견적서 ${existing.quotationNumber}이 삭제되었습니다.` });
    } catch (error: any) {
        console.error("견적서 삭제 오류:", error);
        res.status(500).json({ success: false, message: "견적서 삭제 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// PUT /api/quotations/:id/status
// ────────────────────────────────────────────
router.put("/:id/status", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const { status } = req.body;
        const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `status는 ${validStatuses.join(', ')} 중 하나여야 합니다.` });
        }

        const [existing] = await db.select().from(quotations).where(eq(quotations.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "견적서를 찾을 수 없습니다." });

        const statusLabels: Record<string, string> = { draft: '작성중', sent: '발송됨', accepted: '수락됨', rejected: '거절됨', expired: '만료됨' };

        await db.update(quotations).set({
            status,
            updatedAt: new Date(),
        }).where(eq(quotations.id, id));

        res.json({ success: true, message: `견적서 상태가 "${statusLabels[status]}"(으)로 변경되었습니다.` });
    } catch (error: any) {
        console.error("견적서 상태 변경 오류:", error);
        res.status(500).json({ success: false, message: "견적서 상태 변경 중 오류가 발생했습니다." });
    }
});

export default router;

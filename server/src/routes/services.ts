import { Router } from "express";
import { db } from "../db/index.js";
import {
    services,
    serviceTiers,
    serviceItems,
    serviceItemPrices,
    contractDiscountPolicies,
} from "../db/schema.js";
import { eq, asc } from "drizzle-orm";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";

const router = Router();

// ────────────────────────────────────────────
// 헬퍼: 단일 서비스의 중첩 데이터(tiers, items, prices) 조회
// ────────────────────────────────────────────
async function getServiceWithDetails(serviceId: number) {
    const [service] = await db.select().from(services).where(eq(services.id, serviceId));
    if (!service) return null;

    const tiers = await db
        .select()
        .from(serviceTiers)
        .where(eq(serviceTiers.serviceId, serviceId))
        .orderBy(asc(serviceTiers.sortOrder));

    const items = await db
        .select()
        .from(serviceItems)
        .where(eq(serviceItems.serviceId, serviceId))
        .orderBy(asc(serviceItems.sortOrder));

    const itemsWithPrices = await Promise.all(
        items.map(async (item) => {
            const prices = await db
                .select()
                .from(serviceItemPrices)
                .where(eq(serviceItemPrices.itemId, item.id));
            return { ...item, prices };
        })
    );

    return { ...service, tiers, items: itemsWithPrices };
}

// ════════════════════════════════════════════
// 할인 정책 API (※ /:id보다 먼저 정의해야 함)
// ════════════════════════════════════════════

// GET /api/services/discount-policies
router.get("/discount-policies", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const policies = await db
            .select()
            .from(contractDiscountPolicies)
            .orderBy(asc(contractDiscountPolicies.minMonths));

        res.json({ success: true, data: policies });
    } catch (error: any) {
        console.error("할인 정책 조회 오류:", error);
        res.status(500).json({ success: false, message: "할인 정책 조회 중 오류가 발생했습니다." });
    }
});

// PUT /api/services/discount-policies
router.put("/discount-policies", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { policies } = req.body;
        if (!policies || !Array.isArray(policies)) {
            return res.status(400).json({ success: false, message: "policies 배열이 필요합니다." });
        }

        // 기존 정책 전체 삭제 후 재생성
        await db.delete(contractDiscountPolicies);

        for (const policy of policies) {
            await db.insert(contractDiscountPolicies).values({
                name: policy.name,
                minMonths: policy.minMonths,
                discountRate: policy.discountRate,
                isActive: policy.isActive !== undefined ? policy.isActive : true,
            });
        }

        const updated = await db
            .select()
            .from(contractDiscountPolicies)
            .orderBy(asc(contractDiscountPolicies.minMonths));

        res.json({ success: true, data: updated, message: "할인 정책이 업데이트되었습니다." });
    } catch (error: any) {
        console.error("할인 정책 수정 오류:", error);
        res.status(500).json({ success: false, message: "할인 정책 수정 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// GET /api/services
// 전체 서비스 목록 (중첩 데이터 포함)
// ────────────────────────────────────────────
router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const allServices = await db
            .select()
            .from(services)
            .orderBy(asc(services.sortOrder));

        const result = await Promise.all(
            allServices.map(async (svc) => {
                const tiers = await db
                    .select()
                    .from(serviceTiers)
                    .where(eq(serviceTiers.serviceId, svc.id))
                    .orderBy(asc(serviceTiers.sortOrder));

                const items = await db
                    .select()
                    .from(serviceItems)
                    .where(eq(serviceItems.serviceId, svc.id))
                    .orderBy(asc(serviceItems.sortOrder));

                const itemsWithPrices = await Promise.all(
                    items.map(async (item) => {
                        const prices = await db
                            .select()
                            .from(serviceItemPrices)
                            .where(eq(serviceItemPrices.itemId, item.id));
                        return { ...item, prices };
                    })
                );

                return { ...svc, tiers, items: itemsWithPrices };
            })
        );

        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error("서비스 목록 조회 오류:", error);
        res.status(500).json({ success: false, message: "서비스 목록 조회 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// GET /api/services/:id
// 단일 서비스 상세
// ────────────────────────────────────────────
router.get("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const service = await getServiceWithDetails(id);
        if (!service) return res.status(404).json({ success: false, message: "서비스를 찾을 수 없습니다." });

        res.json({ success: true, data: service });
    } catch (error: any) {
        console.error("서비스 상세 조회 오류:", error);
        res.status(500).json({ success: false, message: "서비스 상세 조회 중 오류가 발생했습니다." });
    }
});

// ────────────────────────────────────────────
// POST /api/services
// 서비스 생성 (tiers, items, prices 동시 생성)
// ────────────────────────────────────────────
router.post("/", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { name, slug, description, billingType, isActive, sortOrder, metadata, linkedTaskTemplateId, tiers, items } = req.body;

        if (!name || !slug || !billingType) {
            return res.status(400).json({ success: false, message: "name, slug, billingType은 필수입니다." });
        }

        // 1. 서비스 생성
        const [newService] = await db.insert(services).values({
            name,
            slug,
            description: description || null,
            billingType,
            isActive: isActive !== undefined ? isActive : true,
            sortOrder: sortOrder || 0,
            metadata: metadata || null,
            linkedTaskTemplateId: linkedTaskTemplateId || null,
        }).returning();

        // 2. 등급(Tiers) 생성
        const tierIdMap: Record<string, number> = {};
        if (tiers && Array.isArray(tiers)) {
            for (const tier of tiers) {
                const [newTier] = await db.insert(serviceTiers).values({
                    serviceId: newService.id,
                    name: tier.name,
                    description: tier.description || null,
                    minQuantity: tier.minQuantity || null,
                    maxQuantity: tier.maxQuantity || null,
                    sortOrder: tier.sortOrder || 0,
                    isDefault: tier.isDefault || false,
                }).returning();
                if (tier.tempId) {
                    tierIdMap[tier.tempId] = newTier.id;
                }
                tierIdMap[`sort_${tier.sortOrder}`] = newTier.id;
            }
        }

        // 3. 비용 항목(Items) + 가격(Prices) 생성
        if (items && Array.isArray(items)) {
            for (const item of items) {
                const [newItem] = await db.insert(serviceItems).values({
                    serviceId: newService.id,
                    name: item.name,
                    description: item.description || null,
                    category: item.category,
                    isRequired: item.isRequired !== undefined ? item.isRequired : true,
                    priceUnit: item.priceUnit,
                    unitLabel: item.unitLabel || null,
                    sortOrder: item.sortOrder || 0,
                }).returning();

                if (item.prices && Array.isArray(item.prices)) {
                    for (const price of item.prices) {
                        let resolvedTierId: number | null = null;
                        if (price.tierId !== null && price.tierId !== undefined) {
                            if (typeof price.tierId === 'string' && tierIdMap[price.tierId]) {
                                resolvedTierId = tierIdMap[price.tierId];
                            } else if (typeof price.tierId === 'number') {
                                resolvedTierId = price.tierId;
                            } else if (tierIdMap[`sort_${price.tierSortOrder}`]) {
                                resolvedTierId = tierIdMap[`sort_${price.tierSortOrder}`];
                            }
                        }

                        await db.insert(serviceItemPrices).values({
                            itemId: newItem.id,
                            tierId: resolvedTierId,
                            price: price.price,
                        });
                    }
                }
            }
        }

        const fullService = await getServiceWithDetails(newService.id);
        res.status(201).json({ success: true, data: fullService, message: `"${name}" 서비스가 생성되었습니다.` });
    } catch (error: any) {
        console.error("서비스 생성 오류:", error);
        if (error.code === '23505' && error.constraint?.includes('slug')) {
            return res.status(409).json({ success: false, message: "이미 존재하는 slug입니다." });
        }
        res.status(500).json({ success: false, message: "서비스 생성 중 오류가 발생했습니다.", detail: error.message });
    }
});

// ────────────────────────────────────────────
// PUT /api/services/:id
// 서비스 수정 (전체 동기화 — 기존 하위 데이터 삭제 후 재생성)
// ────────────────────────────────────────────
router.put("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [existing] = await db.select().from(services).where(eq(services.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "서비스를 찾을 수 없습니다." });

        const { name, slug, description, billingType, isActive, sortOrder, metadata, linkedTaskTemplateId, tiers, items } = req.body;

        // 1. 서비스 기본 정보 업데이트
        await db.update(services).set({
            name: name || existing.name,
            slug: slug || existing.slug,
            description: description !== undefined ? description : existing.description,
            billingType: billingType || existing.billingType,
            isActive: isActive !== undefined ? isActive : existing.isActive,
            sortOrder: sortOrder !== undefined ? sortOrder : existing.sortOrder,
            metadata: metadata !== undefined ? metadata : existing.metadata,
            linkedTaskTemplateId: linkedTaskTemplateId !== undefined ? linkedTaskTemplateId : existing.linkedTaskTemplateId,
            updatedAt: new Date(),
        }).where(eq(services.id, id));

        // 2. 하위 데이터 전체 동기화 (tiers, items, prices가 제공된 경우만)
        if (tiers !== undefined && items !== undefined) {
            await db.delete(serviceItems).where(eq(serviceItems.serviceId, id));
            await db.delete(serviceTiers).where(eq(serviceTiers.serviceId, id));

            const tierIdMap: Record<string, number> = {};
            if (tiers && Array.isArray(tiers)) {
                for (const tier of tiers) {
                    const [newTier] = await db.insert(serviceTiers).values({
                        serviceId: id,
                        name: tier.name,
                        description: tier.description || null,
                        minQuantity: tier.minQuantity || null,
                        maxQuantity: tier.maxQuantity || null,
                        sortOrder: tier.sortOrder || 0,
                        isDefault: tier.isDefault || false,
                    }).returning();
                    if (tier.tempId) tierIdMap[tier.tempId] = newTier.id;
                    tierIdMap[`sort_${tier.sortOrder}`] = newTier.id;
                }
            }

            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const [newItem] = await db.insert(serviceItems).values({
                        serviceId: id,
                        name: item.name,
                        description: item.description || null,
                        category: item.category,
                        isRequired: item.isRequired !== undefined ? item.isRequired : true,
                        priceUnit: item.priceUnit,
                        unitLabel: item.unitLabel || null,
                        sortOrder: item.sortOrder || 0,
                    }).returning();

                    if (item.prices && Array.isArray(item.prices)) {
                        for (const price of item.prices) {
                            let resolvedTierId: number | null = null;
                            if (price.tierId !== null && price.tierId !== undefined) {
                                if (typeof price.tierId === 'string' && tierIdMap[price.tierId]) {
                                    resolvedTierId = tierIdMap[price.tierId];
                                } else if (typeof price.tierId === 'number') {
                                    resolvedTierId = price.tierId;
                                } else if (tierIdMap[`sort_${price.tierSortOrder}`]) {
                                    resolvedTierId = tierIdMap[`sort_${price.tierSortOrder}`];
                                }
                            }

                            await db.insert(serviceItemPrices).values({
                                itemId: newItem.id,
                                tierId: resolvedTierId,
                                price: price.price,
                            });
                        }
                    }
                }
            }
        }

        const fullService = await getServiceWithDetails(id);
        res.json({ success: true, data: fullService, message: `"${fullService?.name}" 서비스가 수정되었습니다.` });
    } catch (error: any) {
        console.error("서비스 수정 오류:", error);
        if (error.code === '23505' && error.constraint?.includes('slug')) {
            return res.status(409).json({ success: false, message: "이미 존재하는 slug입니다." });
        }
        res.status(500).json({ success: false, message: "서비스 수정 중 오류가 발생했습니다.", detail: error.message });
    }
});

// ────────────────────────────────────────────
// DELETE /api/services/:id
// 서비스 완전 삭제 (하위 tiers, items는 cascade 삭제)
// ────────────────────────────────────────────
router.delete("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [existing] = await db.select().from(services).where(eq(services.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "서비스를 찾을 수 없습니다." });

        await db.delete(services).where(eq(services.id, id));

        res.json({ success: true, message: `"${existing.name}" 서비스가 삭제되었습니다.` });
    } catch (error: any) {
        console.error("서비스 삭제 오류:", error);
        res.status(500).json({ success: false, message: "서비스 삭제 중 오류가 발생했습니다." });
    }
});

export default router;

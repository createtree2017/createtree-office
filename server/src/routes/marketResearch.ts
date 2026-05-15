import { Router } from "express";
import * as XLSX from "xlsx";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
    marketResearchChangeLogs,
    marketResearchItems,
    marketResearchRuns,
    salesLeads,
} from "../db/schema.js";
import { authenticateToken, authorizeRole, AuthRequest } from "../middleware/auth.js";
import { buildStableKey, collectMarketResearchItems } from "../services/sales/marketResearchCollector.js";

const router = Router();
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const TRACKED_FIELDS = [
    "businessType",
    "region",
    "city",
    "district",
    "address",
    "operationStatus",
    "phone",
    "email",
    "website",
    "instagram",
    "blog",
    "kakaoChannel",
    "naverTalk",
    "openDate",
    "closedDate",
    "isDeliveryHospital",
    "deliveryCountYear",
    "deliveryCount",
    "deliveryCountSource",
    "medicalDepartments",
    "doctorCounts",
    "totalDoctorCount",
    "hasDeliveryCenter",
    "hasFertilityCenter",
    "hasPediatricLink",
    "roomCount",
    "motherCapacity",
    "babyCapacity",
    "roomGrades",
    "aestheticBrand",
    "additionalServices",
    "buildingScale",
    "occupiedFloors",
    "isStandaloneBuilding",
    "parkingAvailable",
    "marketScore",
    "priorityGrade",
    "sourceConfidence",
    "verificationStatus",
    "rawData",
] as const;

function toArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

function stringify(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function normalizeName(value: string): string {
    return value.replace(/\s+/g, "").toLowerCase();
}

function passesFilters(item: any, query: any): boolean {
    const businessTypes = toArray(query.businessType || query.businessTypes);
    const regions = toArray(query.region || query.regions);
    const operationStatuses = toArray(query.operationStatus || query.operationStatuses);
    const flags = toArray(query.flag || query.flags);
    const q = String(query.q || "").trim().toLowerCase();

    if (businessTypes.length > 0) {
        let deliveryTypeSatisfied = false;
        if (businessTypes.includes("delivery_hospital")) {
            const isDeliveryCandidate = isDeliveryCandidateItem(item);
            if (!isDeliveryCandidate && businessTypes.length === 1) return false;
            deliveryTypeSatisfied = isDeliveryCandidate;
        }
        const isObgynGroup = businessTypes.includes("obgyn") && ["obgyn", "delivery_hospital", "general_obgyn", "women_hospital"].includes(item.businessType);
        if (!deliveryTypeSatisfied && !businessTypes.includes(item.businessType) && !isObgynGroup) return false;
    }
    if (regions.length > 0 && !regions.includes("전국") && !regions.includes(item.region) && !regions.includes(item.city)) return false;
    if (operationStatuses.length > 0 && !operationStatuses.includes(item.operationStatus)) return false;
    if (flags.includes("selected") && !item.isSelected) return false;
    if (flags.includes("new") && !item.isNew) return false;
    if (flags.includes("updated") && !item.hasUpdates) return false;
    if (flags.includes("unselected") && item.isSelected) return false;
    if (q && ![item.name, item.address, item.phone, item.email].some((v: any) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
}

function getDeliveryCandidate(item: any) {
    return item.rawData?.deliveryCandidate || {};
}

function isDeliveryCandidateItem(item: any): boolean {
    if (item.rawData?.manualDeliveryCandidate !== undefined) {
        return item.rawData.manualDeliveryCandidate === true;
    }
    return item.isDeliveryHospital || (getDeliveryCandidate(item).score ?? 0) >= 3;
}

function isNaverVerifiedObgyn(item: any): boolean {
    return item.rawData?.naverLocal?.category === "병원,의원>산부인과";
}

function isObgynCandidate(item: any): boolean {
    return isNaverVerifiedObgyn(item) || item.rawData?.nameKeywordMatched === true || item.rawData?.detailedResearchEligible === true;
}

function passesView(item: any, query: any): boolean {
    const view = String(query.view || "verified_obgyn");
    if (view === "all") return true;
    if (view === "delivery_candidates") return isDeliveryCandidateItem(item);
    if (view === "detail_candidates") return item.rawData?.detailedResearchEligible === true;
    return isObgynCandidate(item);
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    const normalized = Math.floor(parsed);
    return max ? Math.min(normalized, max) : normalized;
}

function applyLeadState(rows: any[], leads: any[]) {
    const leadByItemId = new Map(leads.map((lead) => [lead.marketResearchItemId, lead]));
    return rows.map((item) => {
        const lead = leadByItemId.get(item.id);
        return {
            ...item,
            isSelected: !!lead || item.isSelected,
            salesLeadId: lead?.id || null,
            salesStatus: lead?.status || null,
        };
    });
}

async function markInterruptedRunningRuns(reason: string) {
    const runningRuns = await db.select().from(marketResearchRuns).where(eq(marketResearchRuns.status, "running"));
    for (const run of runningRuns) {
        await db.update(marketResearchRuns).set({
            status: "failed",
            stats: {
                ...(run.stats || {}),
                stage: "interrupted",
                errors: ((run.stats as any)?.errors || 0) + 1,
                interruptedAt: new Date().toISOString(),
            },
            errorLog: [
                ...((Array.isArray(run.errorLog) ? run.errorLog : []) as any[]),
                { source: "시장조사 실행", message: reason },
            ],
            completedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(marketResearchRuns.id, run.id));
    }
}

function isMarketResearchRunEnabled() {
    const value = process.env.MARKET_RESEARCH_RUN_ENABLED;
    if (value !== undefined) return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    return process.env.NODE_ENV !== "production";
}

async function listItems(query: any, options: { paginate?: boolean } = { paginate: true }) {
    const rows = await db.select().from(marketResearchItems).orderBy(desc(marketResearchItems.updatedAt));
    const leads = await db.select().from(salesLeads).where(eq(salesLeads.isArchived, false));
    const filtered = applyLeadState(rows, leads)
        .filter((item) => passesView(item, query))
        .filter((item) => passesFilters(item, query));

    if (options.paginate === false) {
        return {
            items: filtered,
            meta: {
                total: filtered.length,
                page: 1,
                pageSize: filtered.length,
                totalPages: 1,
            },
        };
    }

    const page = parsePositiveInt(query.page, 1);
    const pageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const start = (normalizedPage - 1) * pageSize;

    return {
        items: filtered.slice(start, start + pageSize),
        meta: {
            total,
            page: normalizedPage,
            pageSize,
            totalPages,
        },
    };
}

async function getSummary(query: any) {
    const rows = await db.select().from(marketResearchItems).orderBy(desc(marketResearchItems.updatedAt));
    const leads = await db.select().from(salesLeads).where(eq(salesLeads.isArchived, false));
    const filtered = applyLeadState(rows, leads)
        .filter((item) => passesView(item, query))
        .filter((item) => passesFilters(item, query));

    return {
        total: filtered.length,
        selected: filtered.filter((item) => item.isSelected).length,
        newItems: filtered.filter((item) => item.isNew).length,
        updated: filtered.filter((item) => item.hasUpdates).length,
        deliveryCandidates: filtered.filter(isDeliveryCandidateItem).length,
        closed: filtered.filter((item) => item.operationStatus === "closed").length,
        verifiedObgyn: filtered.filter(isNaverVerifiedObgyn).length,
        detailCandidates: filtered.filter((item) => item.rawData?.detailedResearchEligible === true).length,
    };
}

router.get("/runs", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (_req, res) => {
    try {
        const runs = await db.select().from(marketResearchRuns).orderBy(desc(marketResearchRuns.createdAt));
        res.json({ success: true, data: runs });
    } catch (error: any) {
        console.error("시장조사 실행 목록 오류:", error);
        res.status(500).json({ success: false, message: "시장조사 실행 목록을 불러오지 못했습니다." });
    }
});

router.post("/runs", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    let run: any = null;
    let progressStats: Record<string, any> = {
        stage: "starting",
        processed: 0,
        total: 0,
        hiraBaseCount: 0,
        hiraDetailProcessed: 0,
        equipmentProcessed: 0,
        deliveryCandidateCount: 0,
        naverProcessed: 0,
        inserted: 0,
        updated: 0,
        changed: 0,
        errors: 0,
    };
    try {
        if (!isMarketResearchRunEnabled()) {
            return res.status(403).json({
                success: false,
                message: "배포 서버에서는 시장조사 실행이 비활성화되어 있습니다. 시장조사는 로컬 서버에서 실행해주세요.",
            });
        }

        const user = req.user!;
        const regions = Array.isArray(req.body.regions) ? req.body.regions : toArray(req.body.regions);
        const businessTypes = Array.isArray(req.body.businessTypes) ? req.body.businessTypes : toArray(req.body.businessTypes);
        const operationStatuses = Array.isArray(req.body.operationStatuses) ? req.body.operationStatuses : toArray(req.body.operationStatuses);
        const title = req.body.title || `시장조사 ${new Date().toISOString().slice(0, 10)}`;

        await markInterruptedRunningRuns("새 시장조사 실행 또는 수집 로직 배포로 이전 running 상태를 안전 중단 처리했습니다.");

        [run] = await db.insert(marketResearchRuns).values({
            title,
            regionScope: req.body.regionScope || regions[0] || "전국",
            regions,
            businessTypes,
            operationStatuses,
            status: "running",
            stats: progressStats,
            startedAt: new Date(),
            createdBy: user.id,
        }).returning();

        const updateProgress = async (patch: Record<string, any>) => {
            progressStats = {
                ...progressStats,
                ...patch,
                updatedAt: new Date().toISOString(),
            };
            await db.update(marketResearchRuns).set({
                stats: progressStats,
                updatedAt: new Date(),
            }).where(eq(marketResearchRuns.id, run.id));
        };

        const collected = await collectMarketResearchItems({
            title,
            regionScope: req.body.regionScope,
            regions,
            businessTypes,
            operationStatuses,
            onProgress: updateProgress,
        });

        const existingItems = await db.select().from(marketResearchItems);
        const activeLeads = await db.select().from(salesLeads).where(eq(salesLeads.isArchived, false));
        const selectedItemIds = new Set(activeLeads.map((lead) => lead.marketResearchItemId));
        let inserted = 0;
        let updated = 0;
        let changed = 0;

        await updateProgress({
            stage: "saving",
            processed: 0,
            total: collected.items.length,
            errors: collected.errors.length,
        });

        for (const candidate of collected.items) {
            const stableKey = candidate.stableKey || buildStableKey(candidate.name, candidate.address, candidate.phone);
            const existing = existingItems.find(item => item.stableKey === stableKey);
            const selected = existing ? selectedItemIds.has(existing.id) || existing.isSelected : false;

            if (!existing) {
                await db.insert(marketResearchItems).values({
                    ...candidate,
                    runId: run.id,
                    stableKey,
                    normalizedName: normalizeName(candidate.name),
                    isNew: true,
                    hasUpdates: false,
                    isSelected: false,
                    lastResearchedAt: new Date(),
                });
                inserted++;
            } else {
                const changes = TRACKED_FIELDS
                    .filter((field) => stringify((existing as any)[field]) !== stringify((candidate as any)[field]))
                    .map((field) => ({
                        itemId: existing.id,
                        runId: run.id,
                        fieldName: field,
                        previousValue: stringify((existing as any)[field]),
                        newValue: stringify((candidate as any)[field]),
                    }));

                if (changes.length > 0) {
                    await db.insert(marketResearchChangeLogs).values(changes);
                    changed++;
                }

                await db.update(marketResearchItems).set({
                    ...candidate,
                    runId: run.id,
                    stableKey,
                    normalizedName: normalizeName(candidate.name),
                    isNew: false,
                    hasUpdates: changes.length > 0,
                    isSelected: selected,
                    lastResearchedAt: new Date(),
                    updatedAt: new Date(),
                }).where(eq(marketResearchItems.id, existing.id));
                updated++;
            }

            const processed = inserted + updated;
            if (processed % 50 === 0 || processed === collected.items.length) {
                await updateProgress({
                    stage: "saving",
                    processed,
                    total: collected.items.length,
                    inserted,
                    updated,
                    changed,
                    errors: collected.errors.length,
                });
            }
        }

        const stats = {
            ...progressStats,
            stage: collected.errors.length > 0 ? "partial_failed" : "completed",
            processed: collected.items.length,
            total: collected.items.length,
            inserted,
            updated,
            changed,
            errors: collected.errors.length,
            detailedResearchEligible: collected.items.filter((item: any) => item.rawData?.detailedResearchEligible).length,
            deliveryCandidateCount: collected.items.filter(isDeliveryCandidateItem).length,
            deliveryCandidates: collected.items.filter(isDeliveryCandidateItem).length,
        };
        const status = collected.errors.length > 0 ? "partial_failed" : "completed";
        const [completedRun] = await db.update(marketResearchRuns).set({
            status,
            sources: collected.sources,
            stats,
            errorLog: collected.errors,
            completedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(marketResearchRuns.id, run.id)).returning();

        res.status(201).json({ success: true, data: completedRun, message: "시장조사가 완료되었습니다." });
    } catch (error: any) {
        console.error("시장조사 실행 오류:", error);
        if (run?.id) {
            await db.update(marketResearchRuns).set({
                status: "failed",
                stats: {
                    ...progressStats,
                    stage: "failed",
                    errors: (progressStats.errors || 0) + 1,
                    failedAt: new Date().toISOString(),
                },
                errorLog: [{ source: "시장조사 실행", message: error?.message || "시장조사 실행 중 오류가 발생했습니다." }],
                completedAt: new Date(),
                updatedAt: new Date(),
            }).where(eq(marketResearchRuns.id, run.id));
        }
        res.status(500).json({ success: false, message: "시장조사 실행 중 오류가 발생했습니다.", detail: error.message });
    }
});

router.get("/items", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const data = await listItems(req.query);
        res.json({ success: true, data: data.items, meta: data.meta });
    } catch (error: any) {
        console.error("시장조사 항목 목록 오류:", error);
        res.status(500).json({ success: false, message: "시장조사 항목을 불러오지 못했습니다." });
    }
});

router.get("/summary", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const data = await getSummary(req.query);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("시장조사 요약 오류:", error);
        res.status(500).json({ success: false, message: "시장조사 요약을 불러오지 못했습니다." });
    }
});

router.get("/items/ids", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const { items } = await listItems(req.query, { paginate: false });
        res.json({ success: true, data: items.map((item: any) => item.id) });
    } catch (error: any) {
        console.error("시장조사 항목 ID 목록 오류:", error);
        res.status(500).json({ success: false, message: "시장조사 항목 ID를 불러오지 못했습니다." });
    }
});

router.patch("/items/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const [existing] = await db.select().from(marketResearchItems).where(eq(marketResearchItems.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "시장조사 항목을 찾을 수 없습니다." });

        const allowed = [
            "businessType", "name", "region", "city", "district", "address", "operationStatus", "phone", "email",
            "website", "instagram", "blog", "kakaoChannel", "naverTalk", "openDate", "closedDate", "isDeliveryHospital",
            "deliveryCountYear", "deliveryCount", "deliveryCountSource", "medicalDepartments", "doctorCounts",
            "totalDoctorCount", "hasDeliveryCenter", "hasFertilityCenter", "hasPediatricLink", "roomCount",
            "motherCapacity", "babyCapacity", "roomGrades", "aestheticBrand", "additionalServices", "buildingScale",
            "occupiedFloors", "isStandaloneBuilding", "parkingAvailable", "latitude", "longitude", "marketScore",
            "priorityGrade", "sourceConfidence", "verificationStatus", "memo", "rawData",
        ];
        const updateData: any = { updatedAt: new Date(), verificationStatus: req.body.verificationStatus || "manually_corrected" };
        for (const key of allowed) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }
        if (req.body.rawData !== undefined) {
            updateData.rawData = { ...(existing.rawData || {}), ...(req.body.rawData || {}) };
        }
        if (updateData.name || updateData.address || updateData.phone) {
            updateData.normalizedName = normalizeName(updateData.name || existing.name);
            updateData.stableKey = buildStableKey(updateData.name || existing.name, updateData.address ?? existing.address, updateData.phone ?? existing.phone);
        }

        const [updatedItem] = await db.update(marketResearchItems).set(updateData)
            .where(eq(marketResearchItems.id, id))
            .returning();
        res.json({ success: true, data: updatedItem });
    } catch (error: any) {
        console.error("시장조사 항목 수정 오류:", error);
        res.status(500).json({ success: false, message: "시장조사 항목 수정 실패" });
    }
});

router.post("/items/select-batch", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    try {
        const requestedIds: number[] = Array.isArray(req.body.ids)
            ? req.body.ids
                .map((id: unknown) => Number(id))
                .filter((id: number): id is number => Number.isFinite(id))
            : [];
        const uniqueIds: number[] = [...new Set(requestedIds)];
        if (uniqueIds.length === 0) {
            return res.status(400).json({ success: false, message: "영업선택할 업체가 없습니다." });
        }

        const rows = await db.select({ id: marketResearchItems.id })
            .from(marketResearchItems)
            .where(inArray(marketResearchItems.id, uniqueIds));
        const validIds = rows.map(row => row.id);
        if (validIds.length === 0) {
            return res.status(404).json({ success: false, message: "선택 가능한 시장조사 항목을 찾지 못했습니다." });
        }

        const existingLeads = await db.select().from(salesLeads)
            .where(inArray(salesLeads.marketResearchItemId, validIds));
        const leadByItemId = new Map(existingLeads.map(lead => [lead.marketResearchItemId, lead]));

        for (const itemId of validIds) {
            const existing = leadByItemId.get(itemId);
            if (existing) {
                await db.update(salesLeads).set({
                    isArchived: false,
                    selectedBy: req.user!.id,
                    selectedAt: new Date(),
                    updatedAt: new Date(),
                }).where(eq(salesLeads.id, existing.id));
            } else {
                await db.insert(salesLeads).values({
                    marketResearchItemId: itemId,
                    status: "not_contacted",
                    ownerId: req.user!.id,
                    selectedBy: req.user!.id,
                });
            }
        }

        await db.update(marketResearchItems)
            .set({ isSelected: true, updatedAt: new Date() })
            .where(inArray(marketResearchItems.id, validIds));

        res.status(201).json({ success: true, data: { selected: validIds.length }, message: `${validIds.length}개 업체를 영업선택업체로 저장했습니다.` });
    } catch (error: any) {
        console.error("영업선택 일괄 저장 오류:", error);
        res.status(500).json({ success: false, message: "영업선택 일괄 저장 실패" });
    }
});

router.post("/items/:id/select", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const [item] = await db.select().from(marketResearchItems).where(eq(marketResearchItems.id, id));
        if (!item) return res.status(404).json({ success: false, message: "시장조사 항목을 찾을 수 없습니다." });

        const [existing] = await db.select().from(salesLeads).where(eq(salesLeads.marketResearchItemId, id));
        let lead;
        if (existing) {
            [lead] = await db.update(salesLeads).set({
                isArchived: false,
                selectedBy: req.user!.id,
                selectedAt: new Date(),
                updatedAt: new Date(),
            }).where(eq(salesLeads.id, existing.id)).returning();
        } else {
            [lead] = await db.insert(salesLeads).values({
                marketResearchItemId: id,
                status: "not_contacted",
                ownerId: req.body.ownerId || req.user!.id,
                selectedBy: req.user!.id,
                notes: req.body.notes || null,
            }).returning();
        }
        await db.update(marketResearchItems).set({ isSelected: true, updatedAt: new Date() }).where(eq(marketResearchItems.id, id));
        res.status(201).json({ success: true, data: lead, message: "영업선택업체로 저장했습니다." });
    } catch (error: any) {
        console.error("영업선택 저장 오류:", error);
        res.status(500).json({ success: false, message: "영업선택 저장 실패" });
    }
});

router.delete("/items/:id/select", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        await db.update(salesLeads).set({ isArchived: true, updatedAt: new Date() })
            .where(eq(salesLeads.marketResearchItemId, id));
        await db.update(marketResearchItems).set({ isSelected: false, updatedAt: new Date() })
            .where(eq(marketResearchItems.id, id));
        res.json({ success: true, message: "영업선택을 해제했습니다." });
    } catch (error: any) {
        console.error("영업선택 해제 오류:", error);
        res.status(500).json({ success: false, message: "영업선택 해제 실패" });
    }
});

router.get("/items/:id/changes", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });
        const logs = await db.select().from(marketResearchChangeLogs)
            .where(eq(marketResearchChangeLogs.itemId, id))
            .orderBy(desc(marketResearchChangeLogs.detectedAt));
        res.json({ success: true, data: logs });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "변경 이력 조회 실패" });
    }
});

router.get("/export", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const { items } = await listItems(req.query, { paginate: false });
        const leads = await db.select().from(salesLeads).where(eq(salesLeads.isArchived, false));
        const leadItemIds = new Set(leads.map((lead) => lead.marketResearchItemId));
        const workbook = XLSX.utils.book_new();

        const itemRows = items.map((item: any) => ({
            분만후보점수: getDeliveryCandidate(item).score ?? "",
            분만후보등급: getDeliveryCandidate(item).grade ?? "",
            산부인과의사수: getDeliveryCandidate(item).obgynDoctorCount ?? item.doctorCounts?.["산부인과"] ?? "",
            소아청소년과의사수: getDeliveryCandidate(item).pediatricDoctorCount ?? item.doctorCounts?.["소아청소년과"] ?? "",
            인큐베이터수: getDeliveryCandidate(item).incubatorCount ?? "",
            분만감시기수: getDeliveryCandidate(item).deliveryMonitorCount ?? "",
            네이버카테고리: item.rawData?.naverLocal?.category || "",
            네이버플레이스URL: item.rawData?.manualNaverPlaceUrl || item.rawData?.naverPlaceUrl || item.rawData?.naverLocal?.link || "",
            상세조사후보: item.rawData?.detailedResearchEligible ? "Y" : "N",
            현황: [item.isSelected ? "영업선택" : "", item.isNew ? "신규업체" : "", item.hasUpdates ? "업데이트" : ""].filter(Boolean).join(", ") || "-",
            분류: item.businessType,
            상호: item.name,
            지역: [item.region, item.district].filter(Boolean).join(" "),
            상태: item.operationStatus,
            전화: item.phone || "",
            이메일: item.email || "",
            홈페이지: item.website || "",
            SNS: item.instagram || "",
            진료과: (item.medicalDepartments || []).join(", "),
            의료진수: item.totalDoctorCount || "",
            분만여부: isDeliveryCandidateItem(item) ? "Y" : "N",
            최근분만수: item.deliveryCount ? `${item.deliveryCountYear || ""} ${item.deliveryCount}` : "",
            객실수: item.roomCount || "",
            객실등급: JSON.stringify(item.roomGrades || []),
            서비스: (item.additionalServices || []).join(", "),
            규모: item.buildingScale || "",
            출처: (item.sources || []).join(", "),
            신뢰도: item.sourceConfidence,
            검증상태: item.verificationStatus,
            최종조사일: item.lastResearchedAt,
        }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemRows), "시장조사");

        const selectedRows = items
            .filter((item: any) => leadItemIds.has(item.id) || item.isSelected)
            .map((item: any) => ({ 상호: item.name, 분류: item.businessType, 지역: item.region, 영업상태: item.salesStatus || "", 전화: item.phone || "", 이메일: item.email || "" }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(selectedRows), "영업선택");

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const fileName = encodeURIComponent(`시장조사_${new Date().toISOString().slice(0, 10)}.xlsx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.send(buffer);
    } catch (error: any) {
        console.error("시장조사 엑셀 다운로드 오류:", error);
        res.status(500).json({ success: false, message: "엑셀 다운로드 실패" });
    }
});

export default router;

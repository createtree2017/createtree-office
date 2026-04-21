import { Router } from "express";
import { db } from "../db/index.js";
import { contracts, quotations, quotationItems, clients, users } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";

const router = Router();

// 계약번호 자동 채번
async function generateContractNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CT-${dateStr}-`;
    const all = await db.select({ cn: contracts.contractNumber }).from(contracts);
    const nums = all.filter(c => c.cn.startsWith(prefix)).map(c => parseInt(c.cn.replace(prefix, '')) || 0);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${prefix}${String(next).padStart(3, '0')}`;
}

// 계약서 상세 조회 헬퍼
async function getContractDetail(id: number) {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return null;
    let clientName = '';
    if (contract.clientId) {
        const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, contract.clientId));
        clientName = c?.name || '';
    }
    let createdByName = '';
    if (contract.createdBy) {
        const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, contract.createdBy));
        createdByName = u?.name || '';
    }
    let quotationNumber = '';
    if (contract.quotationId) {
        const [q] = await db.select({ qn: quotations.quotationNumber }).from(quotations).where(eq(quotations.id, contract.quotationId));
        quotationNumber = q?.qn || '';
    }
    return { ...contract, clientName, createdByName, quotationNumber };
}

// GET /api/contracts
router.get("/", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const all = await db.select().from(contracts).orderBy(desc(contracts.createdAt));
        const result = await Promise.all(all.map(async (ct) => {
            let clientName = '';
            if (ct.clientId) {
                const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, ct.clientId));
                clientName = c?.name || '';
            }
            let quotationNumber = '';
            if (ct.quotationId) {
                const [q] = await db.select({ qn: quotations.quotationNumber }).from(quotations).where(eq(quotations.id, ct.quotationId));
                quotationNumber = q?.qn || '';
            }
            return { ...ct, clientName, quotationNumber };
        }));
        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error("계약 목록 조회 오류:", error);
        res.status(500).json({ success: false, message: "계약 목록 조회 중 오류" });
    }
});

// GET /api/contracts/my/status — 마이페이지: 본인 거래처 견적서/계약서 요약
router.get("/my/status", authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ success: false, message: "인증 필요" });

        // 사용자의 clientId 조회
        const [u] = await db.select({ clientId: users.clientId }).from(users).where(eq(users.id, userId));
        if (!u?.clientId) return res.json({ success: true, data: { quotations: [], contracts: [], clientName: null } });

        const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, u.clientId));

        // 해당 거래처의 견적서 조회
        const myQuotations = await db.select({
            id: quotations.id,
            quotationNumber: quotations.quotationNumber,
            title: quotations.title,
            status: quotations.status,
            totalAmount: quotations.totalAmount,
            monthlyAmount: quotations.monthlyAmount,
            contractMonths: quotations.contractMonths,
            createdAt: quotations.createdAt,
        }).from(quotations).where(eq(quotations.clientId, u.clientId)).orderBy(desc(quotations.createdAt));

        // 해당 거래처의 계약서 조회
        const myContracts = await db.select({
            id: contracts.id,
            contractNumber: contracts.contractNumber,
            title: contracts.title,
            status: contracts.status,
            totalAmount: contracts.totalAmount,
            monthlyAmount: contracts.monthlyAmount,
            contractMonths: contracts.contractMonths,
            startDate: contracts.startDate,
            endDate: contracts.endDate,
            createdAt: contracts.createdAt,
        }).from(contracts).where(eq(contracts.clientId, u.clientId)).orderBy(desc(contracts.createdAt));

        res.json({
            success: true,
            data: {
                clientName: client?.name || '',
                quotations: myQuotations,
                contracts: myContracts,
            },
        });
    } catch (error: any) {
        console.error("마이페이지 계약 현황 조회 오류:", error);
        res.status(500).json({ success: false, message: "조회 중 오류" });
    }
});

// GET /api/contracts/:id
router.get("/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID" });
        const ct = await getContractDetail(id);
        if (!ct) return res.status(404).json({ success: false, message: "계약서를 찾을 수 없습니다." });
        res.json({ success: true, data: ct });
    } catch (error: any) {
        console.error("계약 상세 조회 오류:", error);
        res.status(500).json({ success: false, message: "계약 상세 조회 중 오류" });
    }
});

// POST /api/contracts/from-quotation/:quotationId — 견적서 → 계약서 변환
router.post("/from-quotation/:quotationId", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const quotationId = parseInt(req.params.quotationId);
        if (isNaN(quotationId)) return res.status(400).json({ success: false, message: "유효하지 않은 견적서 ID" });

        const [qt] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
        if (!qt) return res.status(404).json({ success: false, message: "견적서를 찾을 수 없습니다." });

        const { startDate, endDate, commonTerms, specialTerms } = req.body;
        const contractNumber = await generateContractNumber();
        const userId = (req as any).user?.id || null;

        const [newContract] = await db.insert(contracts).values({
            contractNumber,
            quotationId: qt.id,
            clientId: qt.clientId,
            title: qt.title.replace('견적서', '계약서').replace('견적', '계약') || qt.title,
            contractMonths: qt.contractMonths,
            startDate: startDate || null,
            endDate: endDate || null,
            vatIncluded: qt.vatIncluded,
            subtotal: qt.subtotal,
            discountAmount: qt.discountAmount,
            totalAmount: qt.totalAmount,
            monthlyAmount: qt.monthlyAmount,
            notes: qt.notes,
            commonTerms: commonTerms || null,
            specialTerms: specialTerms || null,
            status: "draft",
            createdBy: userId,
        }).returning();

        // 견적서 상태를 approved로 업데이트
        await db.update(quotations).set({ status: "approved", updatedAt: new Date() }).where(eq(quotations.id, quotationId));

        const full = await getContractDetail(newContract.id);
        res.status(201).json({ success: true, data: full, message: `계약서 ${contractNumber} 생성 완료` });
    } catch (error: any) {
        console.error("계약서 생성 오류:", error);
        res.status(500).json({ success: false, message: "계약서 생성 중 오류", detail: error.message });
    }
});

// PUT /api/contracts/:id
router.put("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID" });
        const [existing] = await db.select().from(contracts).where(eq(contracts.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "계약서를 찾을 수 없습니다." });

        const { title, startDate, endDate, notes, commonTerms, specialTerms } = req.body;
        await db.update(contracts).set({
            title: title !== undefined ? title : existing.title,
            startDate: startDate !== undefined ? startDate : existing.startDate,
            endDate: endDate !== undefined ? endDate : existing.endDate,
            notes: notes !== undefined ? notes : existing.notes,
            commonTerms: commonTerms !== undefined ? commonTerms : existing.commonTerms,
            specialTerms: specialTerms !== undefined ? specialTerms : existing.specialTerms,
            updatedAt: new Date(),
        }).where(eq(contracts.id, id));

        const full = await getContractDetail(id);
        res.json({ success: true, data: full, message: "계약서 수정 완료" });
    } catch (error: any) {
        console.error("계약서 수정 오류:", error);
        res.status(500).json({ success: false, message: "계약서 수정 중 오류" });
    }
});

// PUT /api/contracts/:id/status
router.put("/:id/status", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID" });
        const { status } = req.body;
        const valid = ['draft', 'signed', 'active', 'expired', 'terminated'];
        if (!status || !valid.includes(status)) return res.status(400).json({ success: false, message: `status: ${valid.join(', ')}` });

        const [existing] = await db.select().from(contracts).where(eq(contracts.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "계약서를 찾을 수 없습니다." });

        const updateData: any = { status, updatedAt: new Date() };
        if (status === 'signed') updateData.signedAt = new Date();

        await db.update(contracts).set(updateData).where(eq(contracts.id, id));

        // active 시 clients 테이블 업데이트 (계약일정 + 계약서 번호)
        if (status === 'active' && existing.clientId) {
            await db.update(clients).set({
                contractStartDate: existing.startDate,
                contractEndDate: existing.endDate,
                contractEndedAt: null, // 활성 계약
                contractFileName: existing.contractNumber,
                updatedAt: new Date(),
            }).where(eq(clients.id, existing.clientId));
        }

        // terminated/expired 시: 같은 거래처에 다른 active 계약이 있는지 확인
        if ((status === 'terminated' || status === 'expired') && existing.clientId) {
            const otherActive = await db.select({ id: contracts.id })
                .from(contracts)
                .where(eq(contracts.clientId, existing.clientId));
            const hasOtherActive = otherActive.some(c => c.id !== id && 
                // 방금 상태 변경한 것 제외, 나머지 중 active가 있는지 확인
                true // 아래에서 실제 상태 확인
            );

            // 다시 정확한 체크: 방금 변경한 것 제외하고 active 계약 조회
            const activeContracts = await db.select({ id: contracts.id, status: contracts.status })
                .from(contracts)
                .where(eq(contracts.clientId, existing.clientId));
            const otherActiveExists = activeContracts.some(c => c.id !== id && c.status === 'active');

            if (!otherActiveExists) {
                // 다른 활성 계약이 없을 때만 거래처 계약종료 처리
                await db.update(clients).set({
                    contractEndedAt: new Date(),
                    updatedAt: new Date(),
                }).where(eq(clients.id, existing.clientId));
            }
        }

        const labels: Record<string, string> = { draft: '초안', signed: '서명완료', active: '활성', expired: '만료', terminated: '해지' };
        res.json({ success: true, message: `계약 상태: "${labels[status]}"` });
    } catch (error: any) {
        console.error("계약 상태 변경 오류:", error);
        res.status(500).json({ success: false, message: "계약 상태 변경 중 오류" });
    }
});

// POST /api/contracts/:id/renew — 계약 갱신 (기존 만료 + 신규 생성 원자적 처리)
router.post("/:id/renew", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

        const [existing] = await db.select().from(contracts).where(eq(contracts.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "계약서를 찾을 수 없습니다." });
        if (existing.status !== 'active') return res.status(400).json({ success: false, message: "활성 상태의 계약만 갱신할 수 있습니다." });

        const { contractMonths, startDate, endDate, title, notes, commonTerms, specialTerms } = req.body;

        // 1. 기존 계약 만료 처리
        await db.update(contracts).set({
            status: 'expired',
            updatedAt: new Date(),
        }).where(eq(contracts.id, id));

        // 2. 신규 계약 생성 (기존 내용 복사 + 새로운 값 적용)
        const contractNumber = await generateContractNumber();
        const userId = (req as any).user?.id || null;

        const [newContract] = await db.insert(contracts).values({
            contractNumber,
            quotationId: existing.quotationId,
            clientId: existing.clientId,
            title: title || existing.title,
            contractMonths: contractMonths !== undefined ? contractMonths : existing.contractMonths,
            startDate: startDate || null,
            endDate: endDate || null,
            vatIncluded: existing.vatIncluded,
            subtotal: existing.subtotal,
            discountAmount: existing.discountAmount,
            totalAmount: existing.totalAmount,
            monthlyAmount: existing.monthlyAmount,
            notes: notes !== undefined ? notes : existing.notes,
            commonTerms: commonTerms !== undefined ? commonTerms : existing.commonTerms,
            specialTerms: specialTerms !== undefined ? specialTerms : existing.specialTerms,
            status: "active", // 즉시 활성화
            signedAt: new Date(),
            createdBy: userId,
        }).returning();

        // 3. 거래처 계약 정보 업데이트 (끊김 없이 갱신)
        await db.update(clients).set({
            contractStartDate: startDate || existing.startDate,
            contractEndDate: endDate || existing.endDate,
            contractEndedAt: null,
            contractFileName: contractNumber,
            updatedAt: new Date(),
        }).where(eq(clients.id, existing.clientId));

        const full = await getContractDetail(newContract.id);
        res.status(201).json({
            success: true,
            data: full,
            message: `계약 갱신 완료: ${existing.contractNumber} → ${contractNumber}`,
        });
    } catch (error: any) {
        console.error("계약 갱신 오류:", error);
        res.status(500).json({ success: false, message: "계약 갱신 중 오류", detail: error.message });
    }
});

// GET /api/contracts/client/:clientId/services — 거래처의 활성 계약 서비스 상품 조회
router.get("/client/:clientId/services", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.clientId);
        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

        // 해당 거래처의 활성 계약 조회
        const activeContracts = await db.select()
            .from(contracts)
            .where(and(eq(contracts.clientId, clientId), eq(contracts.status, 'active')));

        if (activeContracts.length === 0) {
            return res.json({ success: true, data: [], contractNumber: null });
        }

        // 가장 최근 활성 계약의 견적서 항목 조회
        const latest = activeContracts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        let items: any[] = [];
        if (latest.quotationId) {
            items = await db.select().from(quotationItems)
                .where(eq(quotationItems.quotationId, latest.quotationId));
        }

        // 서비스명별로 그룹화
        const serviceMap = new Map<string, { serviceName: string; items: typeof items }>();
        for (const item of items) {
            const key = item.serviceName;
            if (!serviceMap.has(key)) serviceMap.set(key, { serviceName: key, items: [] });
            serviceMap.get(key)!.items.push(item);
        }

        res.json({
            success: true,
            data: Array.from(serviceMap.values()),
            contractNumber: latest.contractNumber,
            contractId: latest.id,
            totalAmount: latest.totalAmount,
            monthlyAmount: latest.monthlyAmount,
        });
    } catch (error: any) {
        console.error("거래처 계약 서비스 조회 오류:", error);
        res.status(500).json({ success: false, message: "조회 중 오류" });
    }
});

// DELETE /api/contracts/:id
router.delete("/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, message: "유효하지 않은 ID입니다." });

        const [existing] = await db.select().from(contracts).where(eq(contracts.id, id));
        if (!existing) return res.status(404).json({ success: false, message: "계약서를 찾을 수 없습니다." });

        if (['active', 'terminated', 'expired'].includes(existing.status)) {
            return res.status(400).json({ success: false, message: "완료본(활성, 해지, 만료) 계약서는 삭제할 수 없습니다. 대신 상태를 변경해주세요." });
        }

        await db.delete(contracts).where(eq(contracts.id, id));
        res.json({ success: true, message: `계약서 ${existing.contractNumber}이 삭제되었습니다.` });
    } catch (error: any) {
        console.error("계약서 삭제 오류:", error);
        res.status(500).json({ success: false, message: "계약서 삭제 중 오류가 발생했습니다." });
    }
});

export default router;


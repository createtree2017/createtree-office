import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Plus, Save, ArrowLeft, Trash2, ChevronRight, ChevronLeft, Check, Search, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import SubNav from '../components/SubNav';
import ClientFilter from '../components/ClientFilter';

// ===== 타입 =====
type QuotationStatus = 'draft' | 'proposed' | 'approved';
type PaymentMethod = 'lump_sum' | 'installment' | 'monthly_settle';
type BillingType = 'monthly' | 'per_event' | 'one_time' | 'quote_based';

interface QItem { id?: number; serviceId: number | null; serviceName: string; tierId?: number | null; tierName?: string; itemId?: number | null; itemName: string; itemCategory: string; itemPriceUnit: string; quantity: number; unitPrice: number; amount: number; isRequired: boolean; paymentMethod?: PaymentMethod | null; sortOrder: number; }
interface QServiceConfig { serviceId: number | null; serviceName: string; billingType: string; selectedTierId?: number | null; selectedTierName?: string; eventFrequency?: string; eventPaymentMethod?: PaymentMethod | null; notes?: string; }
interface Quotation { id: number; quotationNumber: string; clientId: number; clientName?: string; title: string; contractMonths: number; discountPolicyId?: number | null; discountApplied: boolean; subtotal: number; discountAmount: number; totalAmount: number; monthlyAmount: number; notes?: string; status: QuotationStatus; validUntil?: string; createdBy?: number | null; createdByName?: string; createdAt: string; updatedAt: string; items: QItem[]; serviceConfigs: QServiceConfig[]; }

interface Client { id: number; name: string; }
interface ServiceTier { id?: number; tempId?: string; name: string; minQuantity?: number; maxQuantity?: number; sortOrder: number; }
interface ServiceItemPrice { tierId: number | null; price: number; }
interface ServiceItem { id?: number; name: string; category: string; isRequired: boolean; priceUnit: string; unitLabel?: string; sortOrder: number; prices: ServiceItemPrice[]; }
interface Service { id: number; name: string; slug: string; billingType: BillingType; isActive: boolean; tiers: ServiceTier[]; items: ServiceItem[]; }
interface DiscountPolicy { id: number; name: string; minMonths: number; discountType: 'percentage' | 'fixed_amount'; discountRate: number; isActive: boolean; }

const API_Q = '/api/quotations';
const API_S = '/api/services';
const API_C = '/api/clients';
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS_LABELS: Record<QuotationStatus, string> = { draft: '초안', proposed: '제안중', approved: '승인' };
const STATUS_COLORS: Record<QuotationStatus, string> = { draft: 'bg-gray-100 text-gray-700', proposed: 'bg-blue-100 text-blue-700', approved: 'bg-emerald-100 text-emerald-700' };
const BILLING_LABELS: Record<BillingType, string> = { monthly: '월정액', per_event: '건당', one_time: '일회성', quote_based: '견적기반' };
const UNIT_LABELS: Record<string, string> = { per_month: '월', per_event: '회', per_person: '인', per_item: '건', one_time: '일회' };

const QuotationsPage: React.FC = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const [searchParams] = useSearchParams();

    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [view, setView] = useState<'list' | 'edit' | 'detail'>('list');
    const [editId, setEditId] = useState<number | null>(null);
    const [step, setStep] = useState(1); // 1~4 단계
    const [filterClientId, setFilterClientId] = useState<number | 'all' | 'unassigned'>('all');

    // URL ?clientId= 파라미터 수신 (거래처 카드 → 견적서 버튼)
    useEffect(() => {
        const cid = searchParams.get('clientId');
        if (cid) setFilterClientId(parseInt(cid));
    }, [searchParams]);



    // 편집 상태
    const [form, setForm] = useState({ clientId: 0, title: '', contractMonths: 6, discountPolicyId: null as number | null, discountApplied: false, notes: '', validUntil: '' });
    const [selectedServices, setSelectedServices] = useState<Map<number, { service: Service; tierId: number | null; tierName: string; items: QItem[] }>>(new Map());
    const [serviceConfigs, setServiceConfigs] = useState<QServiceConfig[]>([]);

    // 참조 데이터
    const [clients, setClients] = useState<Client[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [policies, setPolicies] = useState<DiscountPolicy[]>([]);
    const [detailQuotation, setDetailQuotation] = useState<Quotation | null>(null);

    // === TanStack Query 기반 데이터 페칭 ===
    const queryClient = useQueryClient();

    const { data: quotationsData, isLoading: qLoading } = useQuery({
        queryKey: ['quotations'],
        queryFn: async () => {
            const res = await fetch(API_Q, { headers: hdrs() });
            const data = await res.json();
            return data.success ? data.data : [];
        },
        staleTime: 60 * 1000,
    });
    const { data: clientsData } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => {
            const res = await fetch(API_C, { headers: hdrs() });
            const data = await res.json();
            return data.success ? data.data : (Array.isArray(data) ? data : []);
        },
        staleTime: 5 * 60 * 1000,
    });
    const { data: servicesData } = useQuery({
        queryKey: ['services'],
        queryFn: async () => {
            const res = await fetch(API_S, { headers: hdrs() });
            const data = await res.json();
            return data.success ? data.data.filter((s: Service) => s.isActive) : [];
        },
        staleTime: 5 * 60 * 1000,
    });
    const { data: policiesData } = useQuery({
        queryKey: ['discount-policies'],
        queryFn: async () => {
            const res = await fetch(`${API_S}/discount-policies`, { headers: hdrs() });
            const data = await res.json();
            return data.success ? data.data.filter((p: DiscountPolicy) => p.isActive) : [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const loading = qLoading;

    // 캐시 → 로컬 state 동기화
    useEffect(() => { if (quotationsData) setQuotations(quotationsData); }, [quotationsData]);
    useEffect(() => { if (clientsData) setClients(clientsData); }, [clientsData]);
    useEffect(() => { if (servicesData) setServices(servicesData); }, [servicesData]);
    useEffect(() => { if (policiesData) setPolicies(policiesData); }, [policiesData]);

    // fetchAll 대체 래퍼
    const fetchAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['quotations'] });
        queryClient.invalidateQueries({ queryKey: ['clients'] });
        queryClient.invalidateQueries({ queryKey: ['services'] });
        queryClient.invalidateQueries({ queryKey: ['discount-policies'] });
    }, [queryClient]);

    // 초기 로드: viewId가 있으면 상세 1건만 fetch
    useEffect(() => {
        const vid = searchParams.get('viewId');
        if (vid) {
            handleDetail(parseInt(vid));
        }
    }, []);

    // 새 견적 시작
    const handleNew = () => {
        setEditId(null);
        setForm({ clientId: 0, title: '', contractMonths: 6, discountPolicyId: null, discountApplied: false, notes: '', validUntil: '' });
        setSelectedServices(new Map());
        setServiceConfigs([]);
        setStep(1);
        setView('edit');
    };

    // 기존 견적 편집 — API에서 상세 데이터 로드
    const handleEdit = async (q: Quotation) => {
        try {
            const res = await fetch(`${API_Q}/${q.id}`, { headers: hdrs() });
            const data = await res.json();
            if (!data.success) { toast.error('견적서 로드 실패'); return; }
            const full: Quotation = data.data;
            setEditId(full.id);
            setForm({ clientId: full.clientId, title: full.title, contractMonths: full.contractMonths, discountPolicyId: full.discountPolicyId || null, discountApplied: full.discountApplied, notes: full.notes || '', validUntil: full.validUntil || '' });
            const svcMap = new Map<number, { service: Service; tierId: number | null; tierName: string; items: QItem[] }>();
            for (const item of full.items) {
                if (item.serviceId) {
                    const svc = services.find(s => s.id === item.serviceId);
                    if (svc) {
                        const existing = svcMap.get(item.serviceId);
                        if (existing) { existing.items.push(item); }
                        else { svcMap.set(item.serviceId, { service: svc, tierId: item.tierId || null, tierName: item.tierName || '', items: [item] }); }
                    }
                }
            }
            setSelectedServices(svcMap);
            setServiceConfigs(full.serviceConfigs || []);
            setStep(1);
            setView('edit');
        } catch { toast.error('견적서 로드 실패'); }
    };

    // 상세 보기
    const handleDetail = async (id: number) => {
        try {
            const res = await fetch(`${API_Q}/${id}`, { headers: hdrs() });
            const data = await res.json();
            if (data.success) { setDetailQuotation(data.data); setView('detail'); }
        } catch { toast.error('견적서 로드 실패'); }
    };

    // 서비스 선택/해제 토글
    const toggleService = (svc: Service) => {
        const map = new Map(selectedServices);
        if (map.has(svc.id)) {
            map.delete(svc.id);
        } else {
            const defaultTier = svc.tiers.length > 0 ? svc.tiers[0] : null;
            // 월정액 서비스일 경우 수량을 계약기간(개월)으로 자동 설정
            const autoQty = (svc.billingType === 'monthly' && form.contractMonths > 0) ? form.contractMonths : 1;
            const items: QItem[] = svc.items.map((it, idx) => {
                const price = defaultTier
                    ? (it.prices.find(p => p.tierId === defaultTier.id)?.price || it.prices.find(p => p.tierId === null)?.price || 0)
                    : (it.prices.find(p => p.tierId === null)?.price || (it.prices[0]?.price ?? 0));
                const qty = (svc.billingType === 'per_event' || svc.billingType === 'one_time') ? 1 : autoQty;
                return { serviceId: svc.id, serviceName: svc.name, tierId: defaultTier?.id || null, tierName: defaultTier?.name || '', itemId: it.id, itemName: it.name, itemCategory: it.category, itemPriceUnit: it.priceUnit, quantity: qty, unitPrice: price, amount: price * qty, isRequired: it.isRequired, sortOrder: idx };
            });
            map.set(svc.id, { service: svc, tierId: defaultTier?.id || null, tierName: defaultTier?.name || '', items });
        }
        setSelectedServices(map);
    };

    // 등급 변경
    const changeTier = (svcId: number, tier: ServiceTier) => {
        const map = new Map(selectedServices);
        const entry = map.get(svcId);
        if (!entry) return;
        const svc = entry.service;
        const items: QItem[] = svc.items.map((it, idx) => {
            const price = it.prices.find(p => p.tierId === tier.id)?.price || it.prices.find(p => p.tierId === null)?.price || 0;
            return { serviceId: svc.id, serviceName: svc.name, tierId: tier.id || null, tierName: tier.name, itemId: it.id, itemName: it.name, itemCategory: it.category, itemPriceUnit: it.priceUnit, quantity: 1, unitPrice: price, amount: price, isRequired: it.isRequired, sortOrder: idx };
        });
        map.set(svcId, { ...entry, tierId: tier.id || null, tierName: tier.name, items });
        setSelectedServices(map);
    };

    // 아이템 수량/단가 변경
    const updateQItem = (svcId: number, itemIdx: number, field: string, val: any) => {
        const map = new Map(selectedServices);
        const entry = map.get(svcId);
        if (!entry) return;
        const items = [...entry.items];
        items[itemIdx] = { ...items[itemIdx], [field]: val };
        if (field === 'quantity' || field === 'unitPrice') {
            items[itemIdx].amount = items[itemIdx].quantity * items[itemIdx].unitPrice;
        }
        map.set(svcId, { ...entry, items });
        setSelectedServices(map);
    };

    // 금액 계산
    const allItems = Array.from(selectedServices.values()).flatMap(e => e.items);
    const subtotal = allItems.reduce((sum, it) => sum + it.amount, 0);
    const policy = policies.find(p => p.id === form.discountPolicyId);
    const discountAmount = form.discountApplied && policy ? (policy.discountType === 'fixed_amount' ? policy.discountRate : Math.round(subtotal * policy.discountRate / 100)) : 0;
    const totalAmount = subtotal - discountAmount;
    const vatAmount = Math.round(totalAmount * 0.1); // 부가세 10%
    const grandTotal = totalAmount + vatAmount;
    const monthlyAmount = form.contractMonths > 0 ? Math.round(totalAmount / form.contractMonths) : totalAmount;

    // 저장
    const handleSave = async () => {
        if (!form.clientId) return toast.error('거래처를 선택해주세요.');
        if (!form.title.trim()) return toast.error('견적서 제목을 입력해주세요.');
        if (selectedServices.size === 0) return toast.error('서비스를 선택해주세요.');

        const configs: QServiceConfig[] = Array.from(selectedServices.entries()).map(([svcId, entry]) => ({
            serviceId: svcId, serviceName: entry.service.name, billingType: entry.service.billingType,
            selectedTierId: entry.tierId, selectedTierName: entry.tierName,
        }));

        const payload = { ...form, subtotal, discountAmount, totalAmount, monthlyAmount, items: allItems, serviceConfigs: configs };
        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `${API_Q}/${editId}` : API_Q;
            const res = await fetch(url, { method, headers: hdrs(), body: JSON.stringify(payload) });
            const data = await res.json();
            if (data.success) { toast.success(data.message); setView('list'); fetchAll(); }
            else toast.error(data.message);
        } catch { toast.error('저장 실패'); }
    };

    // 삭제
    const handleDelete = async (q: Quotation) => {
        if (!confirm(`견적서 ${q.quotationNumber}을 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch(`${API_Q}/${q.id}`, { method: 'DELETE', headers: hdrs() });
            const data = await res.json();
            if (data.success) { toast.success(data.message); fetchAll(); }
        } catch { toast.error('삭제 실패'); }
    };

    // 상태 변경
    const handleStatusChange = async (id: number, status: QuotationStatus) => {
        try {
            const res = await fetch(`${API_Q}/${id}/status`, { method: 'PUT', headers: hdrs(), body: JSON.stringify({ status }) });
            const data = await res.json();
            if (data.success) { toast.success(data.message); fetchAll(); if (detailQuotation) handleDetail(id); }
        } catch { toast.error('상태 변경 실패'); }
    };

    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) return <div className="p-8 text-center text-red-500">접근 권한이 없습니다.</div>;

    // ========== 상세 보기 ==========
    if (view === 'detail' && detailQuotation) {
        const dq = detailQuotation;
        return (
            <div className="max-w-4xl mx-auto p-6 pt-20 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('list')} className="p-2 hover:bg-[hsl(var(--accent))] rounded-lg"><ArrowLeft size={20} /></button>
                        <div>
                            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">견적서 {dq.quotationNumber}</h1>
                            <p className="text-sm text-[hsl(var(--muted-foreground))]">{dq.clientName} · {new Date(dq.createdAt).toLocaleDateString('ko-KR')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_COLORS[dq.status]}`}>{STATUS_LABELS[dq.status]}</span>
                        {user?.role === 'ADMIN' && (
                            <>
                                {dq.status === 'draft' && (
                                    <button onClick={() => handleStatusChange(dq.id, 'proposed')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">제안중으로</button>
                                )}
                                {dq.status === 'proposed' && (
                                    <>
                                        <button onClick={() => handleStatusChange(dq.id, 'draft')} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]">초안으로</button>
                                        <button onClick={() => handleStatusChange(dq.id, 'approved')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">승인</button>
                                    </>
                                )}
                                {dq.status === 'approved' && (
                                    <>
                                        <button onClick={() => handleStatusChange(dq.id, 'proposed')} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]">승인 취소</button>
                                        <button onClick={async () => {
                                            try {
                                                const res = await fetch(`/api/contracts/from-quotation/${dq.id}`, { method: 'POST', headers: hdrs(), body: JSON.stringify({}) });
                                                const data = await res.json();
                                                if (data.success) { toast.success(data.message); window.location.href = '/contracts'; }
                                                else toast.error(data.message);
                                            } catch { toast.error('계약서 생성 실패'); }
                                        }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">📄 계약서 생성</button>
                                    </>
                                )}
                            </>
                        )}
                        <button onClick={() => {
                            const el = document.getElementById('quotation-pdf-area');
                            if (!el) return;
                            html2pdf().set({
                                margin: 10,
                                filename: `${dq.quotationNumber}.pdf`,
                                html2canvas: { scale: 2, useCORS: true },
                                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                            }).from(el).save();
                        }} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] flex items-center gap-1">
                            <Download size={14} /> PDF
                        </button>
                    </div>
                </div>

                {/* 견적서 본문 (PDF 영역) */}
                <div id="quotation-pdf-area" className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-8 space-y-6 print:shadow-none">
                    <div className="text-center border-b border-[hsl(var(--border))] pb-4">
                        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">{dq.title}</h2>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">견적번호: {dq.quotationNumber}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-[hsl(var(--muted-foreground))]">거래처:</span> <span className="font-semibold">{dq.clientName}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">계약기간:</span> <span className="font-semibold">{dq.contractMonths > 0 ? `${dq.contractMonths}개월` : '단건'}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">작성자:</span> <span>{dq.createdByName}</span></div>
                        {dq.validUntil && <div><span className="text-[hsl(var(--muted-foreground))]">유효기간:</span> <span>{dq.validUntil}</span></div>}
                    </div>

                    <table className="w-full text-sm border-collapse">
                        <thead><tr className="bg-[hsl(var(--accent))]">
                            <th className="p-2 text-left border border-[hsl(var(--border))]">서비스</th>
                            <th className="p-2 text-left border border-[hsl(var(--border))]">항목</th>
                            <th className="p-2 text-right border border-[hsl(var(--border))]">단가(만원)</th>
                            <th className="p-2 text-center border border-[hsl(var(--border))]">수량</th>
                            <th className="p-2 text-right border border-[hsl(var(--border))]">금액(만원)</th>
                        </tr></thead>
                        <tbody>
                            {dq.items.map((it, idx) => (
                                <tr key={idx} className={it.isRequired ? '' : 'text-[hsl(var(--muted-foreground))]'}>
                                    <td className="p-2 border border-[hsl(var(--border))]">{it.serviceName}{it.tierName ? ` (${it.tierName})` : ''}</td>
                                    <td className="p-2 border border-[hsl(var(--border))]">{it.isRequired ? '✅' : '☑️'} {it.itemName}</td>
                                    <td className="p-2 text-right border border-[hsl(var(--border))]">{it.unitPrice}</td>
                                    <td className="p-2 text-center border border-[hsl(var(--border))]">{it.quantity}</td>
                                    <td className="p-2 text-right border border-[hsl(var(--border))] font-semibold">{it.amount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2 text-right">
                        <div className="text-sm"><span className="text-[hsl(var(--muted-foreground))]">소계:</span> <span className="font-semibold">{dq.subtotal}만원</span></div>
                        {dq.discountApplied && <div className="text-sm text-red-500">할인: -{dq.discountAmount}만원</div>}
                        <div className="text-sm">공급가액: <span className="font-semibold">{dq.totalAmount}만원</span></div>
                        <div className="text-sm text-[hsl(var(--muted-foreground))]">부가세 (10%): <span className="font-semibold">{Math.round(dq.totalAmount * 0.1)}만원</span></div>
                        <div className="border-t border-[hsl(var(--border))] mt-2 pt-2">
                            <div className="text-lg font-bold text-[hsl(var(--foreground))]">합계 (VAT 포함): {dq.totalAmount + Math.round(dq.totalAmount * 0.1)}만원</div>
                        </div>
                        {dq.contractMonths > 0 && <div className="text-lg font-bold text-blue-600">월 청구: {Math.round(dq.monthlyAmount * 1.1)}만원/월 (VAT 포함)</div>}
                    </div>
                    {dq.notes && <div className="bg-[hsl(var(--accent))] p-4 rounded-lg text-sm"><strong>비고:</strong> {dq.notes}</div>}
                </div>
            </div>
        );
    }

    // ========== 편집 모드 ==========
    if (view === 'edit') {
        return (
            <div className="max-w-5xl mx-auto p-6 pt-20 space-y-6 pb-32">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('list')} className="p-2 hover:bg-[hsl(var(--accent))] rounded-lg"><ArrowLeft size={20} /></button>
                        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{editId ? '견적서 수정' : '새 견적서'}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">Step {step}/4</span>
                        {step > 1 && <button onClick={() => setStep(step - 1)} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] flex items-center gap-1"><ChevronLeft size={14} /> 이전</button>}
                        {step < 4 ? (
                            <button onClick={() => {
                                if (step === 1 && (!form.clientId || !form.title.trim())) return toast.error('거래처와 제목을 입력하세요.');
                                if (step === 2 && selectedServices.size === 0) return toast.error('서비스를 선택하세요.');
                                setStep(step + 1);
                            }} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1">다음 <ChevronRight size={14} /></button>
                        ) : (
                            <button onClick={handleSave} className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 flex items-center gap-2"><Save size={16} /> 저장</button>
                        )}
                    </div>
                </div>

                {/* Step 진행표시 */}
                <div className="flex gap-1">
                    {['거래처/기본', '서비스 선택', '가격/옵션', '최종 확인'].map((label, i) => (
                        <div key={i} className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg ${step === i + 1 ? 'bg-blue-600 text-white' : step > i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]'}`}>{label}</div>
                    ))}
                </div>

                {/* Step 1: 거래처/기본 */}
                {step === 1 && (
                    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
                        <h2 className="text-lg font-bold">📋 기본 정보</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">거래처 *</label>
                                <select value={form.clientId} onChange={e => setForm({ ...form, clientId: parseInt(e.target.value) })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
                                    <option value={0}>선택하세요</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">계약 기간 *</label>
                                <select value={form.contractMonths} onChange={e => setForm({ ...form, contractMonths: parseInt(e.target.value) })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
                                    <option value={0}>단건 (1회성)</option>
                                    {[3, 6, 12, 24].map(m => <option key={m} value={m}>{m}개월</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">견적서 제목 *</label>
                            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))]" placeholder="예: ○○병원 서비스 견적서" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">비고</label>
                            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))] resize-none" rows={2} placeholder="메모 (선택)" />
                        </div>
                    </div>
                )}

                {/* Step 2: 서비스 선택 */}
                {step === 2 && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold">🛒 서비스 선택</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {services.map(svc => {
                                const selected = selectedServices.has(svc.id);
                                return (
                                    <div key={svc.id} onClick={() => toggleService(svc)} className={`bg-[hsl(var(--card))] border-2 rounded-xl p-4 cursor-pointer transition ${selected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-[hsl(var(--border))] hover:border-blue-300'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-bold text-[hsl(var(--foreground))]">{svc.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]">{BILLING_LABELS[svc.billingType]}</span>
                                                {selected && <Check size={18} className="text-emerald-500" />}
                                            </div>
                                        </div>
                                        {svc.tiers.length > 0 && <p className="text-xs text-[hsl(var(--muted-foreground))]">등급: {svc.tiers.map(t => t.name).join(', ')}</p>}
                                        {svc.items.length > 0 && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{svc.items.length}개 항목</p>}
                                    </div>
                                );
                            })}
                        </div>
                        {selectedServices.size > 0 && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✅ {selectedServices.size}개 서비스 선택됨</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: 가격/옵션 */}
                {step === 3 && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold">💰 가격 및 옵션 설정</h2>
                        {Array.from(selectedServices.entries()).map(([svcId, entry]) => (
                            <div key={svcId} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-[hsl(var(--foreground))]">{entry.service.name}</h3>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--accent))]">{BILLING_LABELS[entry.service.billingType]}</span>
                                </div>
                                {/* 등급 선택 */}
                                {entry.service.tiers.length > 0 && (
                                    <div>
                                        <label className="text-sm font-medium text-[hsl(var(--muted-foreground))]">등급 선택</label>
                                        <div className="flex gap-2 mt-1">
                                            {entry.service.tiers.map(t => (
                                                <button key={t.id || t.tempId} onClick={() => changeTier(svcId, t)} className={`px-3 py-1.5 rounded-lg text-sm border transition ${entry.tierId === t.id ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30' : 'border-[hsl(var(--border))] hover:border-blue-300'}`}>
                                                    {t.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* 항목별 가격 */}
                                <div className="space-y-2">
                                    {entry.items.map((it, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-2 bg-[hsl(var(--accent))] rounded-lg">
                                            <span className="text-xs w-4">{it.isRequired ? '✅' : '☑️'}</span>
                                            <span className="text-sm flex-1 font-medium">{it.itemName}</span>
                                            <div className="flex items-center gap-1">
                                                <input type="number" value={it.unitPrice} onChange={e => updateQItem(svcId, idx, 'unitPrice', parseInt(e.target.value) || 0)} className="w-20 p-1.5 border border-[hsl(var(--border))] rounded text-sm text-right bg-[hsl(var(--background))]" />
                                                <span className="text-xs text-[hsl(var(--muted-foreground))]">만원</span>
                                            </div>
                                            <span className="text-xs text-[hsl(var(--muted-foreground))]">×</span>
                                            <input type="number" value={it.quantity} onChange={e => updateQItem(svcId, idx, 'quantity', parseInt(e.target.value) || 1)} className="w-14 p-1.5 border border-[hsl(var(--border))] rounded text-sm text-right bg-[hsl(var(--background))]" />
                                            <span className="text-sm font-semibold w-20 text-right">{it.amount}만원</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {/* 할인 옵션 */}
                        {policies.length > 0 && (
                            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-3">
                                <h3 className="font-bold">🏷️ 할인 적용</h3>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={form.discountApplied} onChange={e => setForm({ ...form, discountApplied: e.target.checked })} className="rounded" />
                                        <span className="text-sm">할인 적용</span>
                                    </label>
                                    {form.discountApplied && (
                                        <select value={form.discountPolicyId || ''} onChange={e => setForm({ ...form, discountPolicyId: parseInt(e.target.value) || null })} className="p-2 border border-[hsl(var(--border))] rounded-lg text-sm bg-[hsl(var(--background))]">
                                            <option value="">정책 선택</option>
                                            {policies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.discountType === 'fixed_amount' ? `${p.discountRate}만원` : `${p.discountRate}%`})</option>)}
                                        </select>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: 최종 확인 */}
                {step === 4 && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold">📝 최종 확인</h2>
                        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><span className="text-[hsl(var(--muted-foreground))]">거래처:</span> <strong>{clients.find(c => c.id === form.clientId)?.name}</strong></div>
                                <div><span className="text-[hsl(var(--muted-foreground))]">계약기간:</span> <strong>{form.contractMonths > 0 ? `${form.contractMonths}개월` : '단건'}</strong></div>
                                <div><span className="text-[hsl(var(--muted-foreground))]">제목:</span> <strong>{form.title}</strong></div>
                                <div><span className="text-[hsl(var(--muted-foreground))]">선택 서비스:</span> <strong>{selectedServices.size}개</strong></div>
                            </div>

                            <table className="w-full text-sm border-collapse">
                                <thead><tr className="bg-[hsl(var(--accent))]">
                                    <th className="p-2 text-left border border-[hsl(var(--border))]">서비스</th>
                                    <th className="p-2 text-left border border-[hsl(var(--border))]">항목</th>
                                    <th className="p-2 text-right border border-[hsl(var(--border))]">단가</th>
                                    <th className="p-2 text-center border border-[hsl(var(--border))]">수량</th>
                                    <th className="p-2 text-right border border-[hsl(var(--border))]">금액</th>
                                </tr></thead>
                                <tbody>
                                    {allItems.map((it, idx) => (
                                        <tr key={idx}>
                                            <td className="p-2 border border-[hsl(var(--border))]">{it.serviceName}{it.tierName ? ` (${it.tierName})` : ''}</td>
                                            <td className="p-2 border border-[hsl(var(--border))]">{it.isRequired ? '✅' : '☑️'} {it.itemName}</td>
                                            <td className="p-2 text-right border border-[hsl(var(--border))]">{it.unitPrice}만원</td>
                                            <td className="p-2 text-center border border-[hsl(var(--border))]">{it.quantity}</td>
                                            <td className="p-2 text-right border border-[hsl(var(--border))] font-semibold">{it.amount}만원</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="border-t border-[hsl(var(--border))] pt-4 space-y-1 text-right">
                                <p className="text-sm">소계: <strong>{subtotal}만원</strong></p>
                                {discountAmount > 0 && <p className="text-sm text-red-500">할인 ({policy?.discountType === 'fixed_amount' ? `${policy?.discountRate}만원` : `${policy?.discountRate}%`}): <strong>-{discountAmount}만원</strong></p>}
                                <p className="text-sm">공급가액: <strong>{totalAmount}만원</strong></p>
                                <p className="text-sm text-[hsl(var(--muted-foreground))]">부가세 (10%): <strong>{vatAmount}만원</strong></p>
                                <div className="border-t border-[hsl(var(--border))] mt-2 pt-2">
                                    <p className="text-xl font-bold text-[hsl(var(--foreground))]">합계 (VAT 포함): {grandTotal}만원</p>
                                </div>
                                {form.contractMonths > 0 && <p className="text-lg font-bold text-blue-600">월 청구: {Math.round(monthlyAmount * 1.1)}만원/월 (VAT 포함)</p>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ========== 목록 모드 ==========
    return (
        <div className="pt-14 min-h-screen bg-[hsl(var(--background))]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <SubNav
                    group="client"
                    rightSlot={
                        user?.role === 'ADMIN' ? (
                            <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-md">
                                <Plus size={16} /> 견적서 작성
                            </button>
                        ) : undefined
                    }
                />

                <ClientFilter
                    clients={clients}
                    selectedId={filterClientId}
                    onSelect={setFilterClientId}
                />

                {loading ? (
                    <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">불러오는 중...</div>
                ) : quotations.length === 0 ? (
                    <div className="text-center py-20 bg-[hsl(var(--card))] border border-dashed border-[hsl(var(--border))] rounded-xl">
                        <FileText size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                        <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">견적서가 없습니다</h3>
                        <p className="text-[hsl(var(--muted-foreground))] mt-2">첫 번째 견적서를 작성해보세요!</p>
                    </div>
                ) : (
                    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead><tr className="bg-[hsl(var(--accent))] border-b border-[hsl(var(--border))]">
                                <th className="p-3 text-left font-semibold">번호</th>
                                <th className="p-3 text-left font-semibold">거래처</th>
                                <th className="p-3 text-left font-semibold">제목</th>
                                <th className="p-3 text-right font-semibold">금액</th>
                                <th className="p-3 text-center font-semibold">기간</th>
                                <th className="p-3 text-center font-semibold">상태</th>
                                <th className="p-3 text-center font-semibold">작성일</th>
                                <th className="p-3 text-center font-semibold">관리</th>
                            </tr></thead>
                            <tbody>
                                {quotations
                                    .filter(q => filterClientId === 'all' || q.clientId === filterClientId)
                                    .map(q => (
                                    <tr key={q.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] cursor-pointer" onClick={() => handleDetail(q.id)}>
                                        <td className="p-3 font-mono text-xs">{q.quotationNumber}</td>
                                        <td className="p-3 font-medium">{q.clientName}</td>
                                        <td className="p-3">{q.title}</td>
                                        <td className="p-3 text-right font-semibold">{q.totalAmount}만원</td>
                                        <td className="p-3 text-center">{q.contractMonths > 0 ? `${q.contractMonths}개월` : '단건'}</td>
                                        <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[q.status]}`}>{STATUS_LABELS[q.status]}</span></td>
                                        <td className="p-3 text-center text-xs">{new Date(q.createdAt).toLocaleDateString('ko-KR')}</td>
                                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-1 justify-center">
                                                {user?.role === 'ADMIN' && <>
                                                    <button onClick={() => handleEdit(q)} className="p-1 hover:text-blue-600 text-[hsl(var(--muted-foreground))]" title="편집">✏️</button>
                                                    <button onClick={() => handleDelete(q)} className="p-1 hover:text-red-600 text-[hsl(var(--muted-foreground))]" title="삭제"><Trash2 size={14} /></button>
                                                </>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuotationsPage;

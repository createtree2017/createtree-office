import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Plus, Save, ArrowLeft, Trash2, Download, ArrowUp, ArrowDown } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import SubNav from '../components/SubNav';
import ClientFilter from '../components/ClientFilter';

// ===== 타입 =====
type QuotationStatus = 'draft' | 'proposed' | 'approved';
type PaymentMethod = 'lump_sum' | 'installment' | 'monthly_settle';
type BillingType = 'monthly' | 'per_event' | 'one_time' | 'quote_based';

interface QItem { id?: number; serviceId: number | null; serviceName: string; tierId?: number | null; tierName?: string; itemId?: number | null; itemName: string; itemCategory: string; itemPriceUnit: string; quantity: number; unitPrice: number; amount: number; isRequired: boolean; paymentMethod?: PaymentMethod | null; sortOrder: number; remark?: string; isCustom?: boolean; }
interface Quotation { id: number; quotationNumber: string; clientId: number; clientName?: string; title: string; contractMonths: number; vatIncluded?: boolean; subtotal: number; discountAmount: number; totalAmount: number; monthlyAmount: number; notes?: string; status: QuotationStatus; validUntil?: string; createdBy?: number | null; createdByName?: string; createdAt: string; updatedAt: string; items: QItem[]; }

interface Client { id: number; name: string; }
interface ServiceTier { id?: number; name: string; sortOrder: number; }
interface ServiceItemPrice { tierId: number | null; price: number; }
interface ServiceItem { id?: number; name: string; category: string; isRequired: boolean; priceUnit: string; sortOrder: number; prices: ServiceItemPrice[]; }
interface Service { id: number; name: string; slug: string; billingType: BillingType; isActive: boolean; tiers: ServiceTier[]; items: ServiceItem[]; }

interface QuotationRow {
    id: string; // 로컬 고유키
    isMasterSelected: boolean;
    serviceId: number | null;
    serviceName: string;
    tierId: number | null;
    tierName: string;
    itemId: number | null;
    itemName: string;
    itemCategory: string;
    itemPriceUnit: string;
    unitPrice: number;
    quantity: number;
    amount: number;
    remark: string;
    isCustom: boolean;
    isRequired: boolean;
    paymentMethod: PaymentMethod | null;
}

const API_Q = '/api/quotations';
const API_S = '/api/services';
const API_C = '/api/clients';
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS_LABELS: Record<QuotationStatus, string> = { draft: '초안', proposed: '제안중', approved: '승인' };
const STATUS_COLORS: Record<QuotationStatus, string> = { draft: 'bg-gray-100 text-gray-700', proposed: 'bg-blue-100 text-blue-700', approved: 'bg-emerald-100 text-emerald-700' };

const QuotationsPage: React.FC = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const [searchParams] = useSearchParams();

    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [view, setView] = useState<'list' | 'edit' | 'detail'>('list');
    const [editId, setEditId] = useState<number | null>(null);
    const [filterClientId, setFilterClientId] = useState<number | 'all' | 'unassigned'>('all');

    useEffect(() => {
        const cid = searchParams.get('clientId');
        if (cid) setFilterClientId(parseInt(cid));
    }, [searchParams]);

    // 편집 상태 (One-Page Form)
    const [form, setForm] = useState({ clientId: 0, title: '', contractMonths: 6, notes: '', validUntil: '', vatIncluded: true });
    const [rows, setRows] = useState<QuotationRow[]>([]);

    // 참조 데이터
    const [clients, setClients] = useState<Client[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [detailQuotation, setDetailQuotation] = useState<Quotation | null>(null);

    const queryClient = useQueryClient();

    const { data: quotationsData, isLoading: qLoading } = useQuery({
        queryKey: ['quotations'],
        queryFn: async () => { const res = await fetch(API_Q, { headers: hdrs() }); const data = await res.json(); return data.success ? data.data : []; },
        staleTime: 60 * 1000,
    });
    const { data: clientsData } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => { const res = await fetch(API_C, { headers: hdrs() }); const data = await res.json(); return data.success ? data.data : []; },
        staleTime: 5 * 60 * 1000,
    });
    const { data: servicesData } = useQuery({
        queryKey: ['services'],
        queryFn: async () => { const res = await fetch(API_S, { headers: hdrs() }); const data = await res.json(); return data.success ? data.data.filter((s: Service) => s.isActive) : []; },
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => { if (quotationsData) setQuotations(quotationsData); }, [quotationsData]);
    useEffect(() => { if (clientsData) setClients(clientsData); }, [clientsData]);
    useEffect(() => { if (servicesData) setServices(servicesData); }, [servicesData]);

    const fetchAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['quotations'] });
    }, [queryClient]);

    useEffect(() => {
        const vid = searchParams.get('viewId');
        if (vid) handleDetail(parseInt(vid));
    }, [searchParams]);

    // 드롭다운에 표시할 서비스 마스터 옵션 생성
    const serviceOptions: { value: string, label: string, svc: Service, tier: ServiceTier | null }[] = [];
    services.forEach(svc => {
        if (svc.tiers.length > 0) {
            svc.tiers.forEach(tier => serviceOptions.push({ value: `svc_${svc.id}_tier_${tier.id}`, label: `${svc.name} (${tier.name})`, svc, tier }));
        } else {
            serviceOptions.push({ value: `svc_${svc.id}`, label: svc.name, svc, tier: null });
        }
    });

    // 새 견적 시작
    const handleNew = () => {
        setEditId(null);
        setForm({ clientId: 0, title: '', contractMonths: 6, notes: '', validUntil: '', vatIncluded: true });
        setRows([{ id: Date.now().toString(), isMasterSelected: false, serviceId: null, serviceName: '', tierId: null, tierName: '', itemId: null, itemName: '', itemCategory: 'service', itemPriceUnit: 'per_month', unitPrice: 0, quantity: 1, amount: 0, remark: '', isCustom: false, isRequired: true, paymentMethod: null }]);
        setView('edit');
    };

    // 기존 견적 편집
    const handleEdit = async (q: Quotation) => {
        try {
            const res = await fetch(`${API_Q}/${q.id}`, { headers: hdrs() });
            const data = await res.json();
            if (!data.success) { toast.error('견적서 로드 실패'); return; }
            const full: Quotation = data.data;
            setEditId(full.id);
            setForm({ clientId: full.clientId, title: full.title, contractMonths: full.contractMonths, notes: full.notes || '', validUntil: full.validUntil || '', vatIncluded: full.vatIncluded !== false });
            
            const loadedRows: QuotationRow[] = full.items.map((it, idx) => ({
                id: `loaded_${idx}`,
                isMasterSelected: true, // 이미 저장된 데이터는 에디터 모드로 활성화
                serviceId: it.serviceId,
                serviceName: it.serviceName,
                tierId: it.tierId || null,
                tierName: it.tierName || '',
                itemId: it.itemId || null,
                itemName: it.itemName,
                itemCategory: it.itemCategory,
                itemPriceUnit: it.itemPriceUnit,
                unitPrice: it.unitPrice,
                quantity: it.quantity,
                amount: it.amount,
                remark: it.remark || '',
                isCustom: it.isCustom || false,
                isRequired: it.isRequired,
                paymentMethod: it.paymentMethod || null
            }));
            setRows(loadedRows);
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

    // Row 변경 핸들러
    const updateRow = (index: number, field: keyof QuotationRow, value: any) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        if (field === 'unitPrice' || field === 'quantity') {
            newRows[index].amount = newRows[index].unitPrice * newRows[index].quantity;
        }
        setRows(newRows);
    };

    const addRow = () => {
        setRows([...rows, { id: Date.now().toString() + Math.random(), isMasterSelected: false, serviceId: null, serviceName: '', tierId: null, tierName: '', itemId: null, itemName: '', itemCategory: 'service', itemPriceUnit: 'per_month', unitPrice: 0, quantity: 1, amount: 0, remark: '', isCustom: false, isRequired: true, paymentMethod: null }]);
    };

    const deleteRow = (index: number) => {
        setRows(rows.filter((_, i) => i !== index));
    };

    const moveRowUp = (index: number) => {
        if (index === 0) return;
        const newRows = [...rows];
        const temp = newRows[index - 1];
        newRows[index - 1] = newRows[index];
        newRows[index] = temp;
        setRows(newRows);
    };

    const moveRowDown = (index: number) => {
        if (index === rows.length - 1) return;
        const newRows = [...rows];
        const temp = newRows[index + 1];
        newRows[index + 1] = newRows[index];
        newRows[index] = temp;
        setRows(newRows);
    };

    // 드롭다운 선택 핸들러
    const handleMasterSelect = (index: number, val: string) => {
        if (!val) return;
        const newRows = [...rows];
        
        if (val === 'custom') {
            newRows[index] = { ...newRows[index], isMasterSelected: true, isCustom: true, serviceName: '직접 입력', itemName: '', unitPrice: 0, quantity: 1, amount: 0 };
            setRows(newRows);
            return;
        }
        if (val === 'discount') {
            newRows[index] = { ...newRows[index], isMasterSelected: true, isCustom: true, serviceName: '할인', itemName: '할인 적용', unitPrice: 0, quantity: 1, amount: 0 };
            setRows(newRows);
            return;
        }

        const opt = serviceOptions.find(o => o.value === val);
        if (!opt) return;

        const { svc, tier } = opt;
        const autoQty = (svc.billingType === 'monthly' && form.contractMonths > 0) ? form.contractMonths : 1;
        const qty = (svc.billingType === 'per_event' || svc.billingType === 'one_time') ? 1 : autoQty;

        const newItems: QuotationRow[] = svc.items.map((it, i) => {
            const price = tier
                ? (it.prices.find(p => p.tierId === tier.id)?.price || it.prices.find(p => p.tierId === null)?.price || 0)
                : (it.prices.find(p => p.tierId === null)?.price || (it.prices[0]?.price ?? 0));
                
            return {
                id: Date.now().toString() + "_" + i,
                isMasterSelected: true,
                serviceId: svc.id,
                serviceName: svc.name + (tier ? ` (${tier.name})` : ''),
                tierId: tier?.id || null,
                tierName: tier?.name || '',
                itemId: it.id || null,
                itemName: it.name,
                itemCategory: it.category,
                itemPriceUnit: it.priceUnit,
                unitPrice: price,
                quantity: qty,
                amount: price * qty,
                remark: '',
                isCustom: false,
                isRequired: it.isRequired,
                paymentMethod: null
            };
        });

        newRows.splice(index, 1, ...newItems);
        setRows(newRows);
    };

    // 합계 계산
    const subtotal = rows.reduce((sum, r) => sum + r.amount, 0); // 할인도 음수로 계산되므로 단순 합
    const vatAmount = form.vatIncluded ? Math.round(subtotal * 0.1) : 0;
    const grandTotal = subtotal + vatAmount;
    const monthlyAmount = form.contractMonths > 0 ? Math.round(subtotal / form.contractMonths) : subtotal;

    // 저장
    const handleSave = async () => {
        if (!form.clientId) return toast.error('거래처를 선택해주세요.');
        if (!form.title.trim()) return toast.error('견적서 제목을 입력해주세요.');
        if (rows.length === 0) return toast.error('서비스 항목을 추가해주세요.');

        // API 스펙 맞추기
        const itemsToSave = rows.map((r, idx) => ({
            serviceId: r.isCustom ? null : r.serviceId,
            serviceName: r.serviceName,
            tierId: r.tierId,
            tierName: r.tierName,
            itemId: r.itemId,
            itemName: r.itemName,
            itemCategory: r.itemCategory,
            itemPriceUnit: r.itemPriceUnit,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            amount: r.amount,
            isRequired: r.isRequired,
            paymentMethod: r.paymentMethod,
            remark: r.remark,
            isCustom: r.isCustom,
            sortOrder: idx
        }));

        const payload = { 
            ...form, 
            subtotal, 
            discountAmount: 0, 
            totalAmount: subtotal,
            monthlyAmount, 
            items: itemsToSave, 
            serviceConfigs: []
        };

        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `${API_Q}/${editId}` : API_Q;
            const res = await fetch(url, { method, headers: hdrs(), body: JSON.stringify(payload) });
            const data = await res.json();
            if (data.success) { toast.success(data.message); setView('list'); fetchAll(); }
            else toast.error(data.message);
        } catch { toast.error('저장 실패'); }
    };

    const handleDelete = async (q: Quotation) => {
        if (!confirm(`견적서 ${q.quotationNumber}을 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch(`${API_Q}/${q.id}`, { method: 'DELETE', headers: hdrs() });
            const data = await res.json();
            if (data.success) { toast.success(data.message); fetchAll(); }
        } catch { toast.error('삭제 실패'); }
    };

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
            <div className="max-w-5xl mx-auto p-6 pt-20 space-y-6">
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
                                {dq.status === 'draft' && <button onClick={() => handleStatusChange(dq.id, 'proposed')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">제안중으로</button>}
                                {dq.status === 'proposed' && (
                                    <>
                                        <button onClick={() => handleStatusChange(dq.id, 'draft')} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))]">초안으로</button>
                                        <button onClick={() => handleStatusChange(dq.id, 'approved')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">승인</button>
                                    </>
                                )}
                                {dq.status === 'approved' && (
                                    <>
                                        <button onClick={() => handleStatusChange(dq.id, 'proposed')} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))]">승인 취소</button>
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
                            html2pdf().set({ margin: 10, filename: `${dq.quotationNumber}.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(el).save();
                        }} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] flex items-center gap-1">
                            <Download size={14} /> PDF
                        </button>
                    </div>
                </div>

                {/* PDF 영역 */}
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
                            <th className="p-2 text-right border border-[hsl(var(--border))] w-24">단가(만원)</th>
                            <th className="p-2 text-center border border-[hsl(var(--border))] w-16">수량</th>
                            <th className="p-2 text-right border border-[hsl(var(--border))] w-28">금액(만원)</th>
                            <th className="p-2 text-left border border-[hsl(var(--border))]">비고</th>
                        </tr></thead>
                        <tbody>
                            {dq.items.map((it, idx) => (
                                <tr key={idx} className={it.amount < 0 ? 'text-red-600' : ''}>
                                    <td className="p-2 border border-[hsl(var(--border))]">{it.serviceName}</td>
                                    <td className="p-2 border border-[hsl(var(--border))]">{it.itemName}</td>
                                    <td className="p-2 text-right border border-[hsl(var(--border))]">{it.unitPrice}</td>
                                    <td className="p-2 text-center border border-[hsl(var(--border))]">{it.quantity}</td>
                                    <td className="p-2 text-right border border-[hsl(var(--border))] font-semibold">{it.amount}</td>
                                    <td className="p-2 border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{it.remark}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2 text-right">
                        <div className="text-sm">공급가액: <span className="font-semibold">{dq.totalAmount}만원</span></div>
                        <div className="text-sm text-[hsl(var(--muted-foreground))]">부가세 ({dq.vatIncluded !== false ? '10%' : '0%'}): <span className="font-semibold">{dq.vatIncluded !== false ? Math.round(dq.totalAmount * 0.1) : 0}만원</span></div>
                        <div className="border-t border-[hsl(var(--border))] mt-2 pt-2">
                            <div className="text-lg font-bold text-[hsl(var(--foreground))]">
                                {dq.vatIncluded !== false ? '합계 (VAT 포함)' : '합계 (VAT 미포함)'}: {dq.totalAmount + (dq.vatIncluded !== false ? Math.round(dq.totalAmount * 0.1) : 0)}만원
                            </div>
                        </div>
                        {dq.contractMonths > 0 && <div className="text-lg font-bold text-blue-600">월 청구: {Math.round(dq.monthlyAmount * (dq.vatIncluded !== false ? 1.1 : 1))}만원/월 ({dq.vatIncluded !== false ? 'VAT 포함' : 'VAT 미포함'})</div>}
                    </div>
                    {dq.notes && <div className="bg-[hsl(var(--accent))] p-4 rounded-lg text-sm"><strong>전체 비고:</strong> {dq.notes}</div>}
                </div>
            </div>
        );
    }

    // ========== 편집 모드 (One-Page Form) ==========
    if (view === 'edit') {
        return (
            <div className="max-w-7xl mx-auto p-6 pt-20 space-y-6 pb-32">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('list')} className="p-2 hover:bg-[hsl(var(--accent))] rounded-lg"><ArrowLeft size={20} /></button>
                        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{editId ? '견적서 수정' : '새 견적서 작성'}</h1>
                    </div>
                    <button onClick={handleSave} className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 flex items-center gap-2 shadow-md"><Save size={16} /> 저장하기</button>
                </div>

                {/* 기본 정보 */}
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4 shadow-sm">
                    <h2 className="text-lg font-bold flex items-center gap-2"><FileText size={18} className="text-blue-600" /> 기본 정보</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">거래처 *</label>
                            <select value={form.clientId} onChange={e => setForm({ ...form, clientId: parseInt(e.target.value) })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] focus:border-blue-500">
                                <option value={0}>선택하세요</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">계약 기간 *</label>
                            <select value={form.contractMonths} onChange={e => setForm({ ...form, contractMonths: parseInt(e.target.value) })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] focus:border-blue-500">
                                <option value={0}>단건 (1회성)</option>
                                {[3, 6, 12, 24].map(m => <option key={m} value={m}>{m}개월</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">견적서 제목 *</label>
                            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] focus:border-blue-500" placeholder="예: ○○병원 서비스 견적서" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">전체 비고 (옵션)</label>
                        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] resize-none focus:border-blue-500" rows={2} placeholder="전체 견적에 대한 설명이나 특이사항" />
                    </div>
                </div>

                {/* 항목 테이블 */}
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-[hsl(var(--accent))] border-b border-[hsl(var(--border))]">
                                <th className="p-3 text-left font-semibold">서비스 (선택/입력)</th>
                                <th className="p-3 text-left font-semibold">항목 (내역)</th>
                                <th className="p-3 text-right font-semibold w-28">단가(만원)</th>
                                <th className="p-3 text-center font-semibold w-20">수량</th>
                                <th className="p-3 text-right font-semibold w-32">금액(만원)</th>
                                <th className="p-3 text-left font-semibold">비고(신규)</th>
                                <th className="p-3 text-center w-28">순서/관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={row.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] transition-colors">
                                    <td className="p-2">
                                        {!row.isMasterSelected ? (
                                            <select onChange={(e) => handleMasterSelect(index, e.target.value)} className="w-full p-2 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] focus:border-blue-500 font-medium text-blue-700">
                                                <option value="">서비스 추가...</option>
                                                {serviceOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                <option value="custom" className="font-bold text-indigo-600">+ 직접 입력</option>
                                                <option value="discount" className="font-bold text-red-600">- 할인 적용</option>
                                            </select>
                                        ) : (
                                            <input value={row.serviceName} onChange={e => updateRow(index, 'serviceName', e.target.value)} className="w-full p-2 border border-transparent hover:border-[hsl(var(--border))] focus:border-blue-500 rounded bg-transparent focus:bg-[hsl(var(--background))] font-medium" placeholder="서비스명" />
                                        )}
                                    </td>
                                    <td className="p-2">
                                        <input value={row.itemName} onChange={e => updateRow(index, 'itemName', e.target.value)} className="w-full p-2 border border-transparent hover:border-[hsl(var(--border))] focus:border-blue-500 rounded bg-transparent focus:bg-[hsl(var(--background))]" placeholder="항목 내역" />
                                    </td>
                                    <td className="p-2">
                                        <input type="number" value={row.unitPrice} onChange={e => updateRow(index, 'unitPrice', parseInt(e.target.value) || 0)} className="w-full p-2 border border-transparent hover:border-[hsl(var(--border))] focus:border-blue-500 rounded bg-transparent focus:bg-[hsl(var(--background))] text-right" />
                                    </td>
                                    <td className="p-2">
                                        <input type="number" value={row.quantity} onChange={e => updateRow(index, 'quantity', parseInt(e.target.value) || 0)} className="w-full p-2 border border-transparent hover:border-[hsl(var(--border))] focus:border-blue-500 rounded bg-transparent focus:bg-[hsl(var(--background))] text-center" />
                                    </td>
                                    <td className={`p-2 text-right font-bold ${row.amount < 0 ? 'text-red-500' : 'text-[hsl(var(--foreground))]'}`}>
                                        {row.amount}
                                    </td>
                                    <td className="p-2">
                                        <input value={row.remark} onChange={e => updateRow(index, 'remark', e.target.value)} className="w-full p-2 border border-transparent hover:border-[hsl(var(--border))] focus:border-blue-500 rounded bg-transparent focus:bg-[hsl(var(--background))]" placeholder="비고/메모" />
                                    </td>
                                    <td className="p-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => moveRowUp(index)} disabled={index === 0} className={`p-1.5 rounded-lg transition-colors ${index === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`} title="위로 이동"><ArrowUp size={16} /></button>
                                            <button onClick={() => moveRowDown(index)} disabled={index === rows.length - 1} className={`p-1.5 rounded-lg transition-colors ${index === rows.length - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`} title="아래로 이동"><ArrowDown size={16} /></button>
                                            <button onClick={() => deleteRow(index)} className="p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors" title="삭제"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="p-3 bg-[hsl(var(--accent))] border-b border-[hsl(var(--border))] flex items-center justify-between">
                        <button onClick={addRow} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 transition-colors">
                            <Plus size={16} /> 칸 만들기 (항목 추가)
                        </button>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={form.vatIncluded} 
                                onChange={(e) => setForm({ ...form, vatIncluded: e.target.checked })} 
                                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500" 
                            />
                            부가세(10%) 자동 적용
                        </label>
                    </div>

                    {/* 합계 영역 */}
                    <div className="p-6 bg-[hsl(var(--background))] text-right space-y-2">
                        <div className="text-sm">공급가액: <span className="font-semibold text-lg inline-block w-32">{subtotal}만원</span></div>
                        <div className="text-sm text-[hsl(var(--muted-foreground))]">부가세 (10%): <span className="font-semibold text-lg inline-block w-32">{vatAmount}만원</span></div>
                        <div className="border-t border-[hsl(var(--border))] mt-3 pt-3 flex justify-end">
                            <div className="text-xl font-bold text-[hsl(var(--foreground))] flex items-center gap-4">
                                {form.vatIncluded ? '합계 (VAT 포함)' : '합계 (VAT 미포함)'}: <span className="text-2xl text-blue-600 inline-block w-32">{grandTotal}만원</span>
                            </div>
                        </div>
                        {form.contractMonths > 0 && <div className="text-sm font-bold text-emerald-600 mt-2">월 청구: {Math.round(monthlyAmount * (form.vatIncluded ? 1.1 : 1))}만원/월 ({form.vatIncluded ? 'VAT 포함' : 'VAT 미포함'})</div>}
                    </div>
                </div>
            </div>
        );
    }

    // ========== 목록 모드 ==========
    return (
        <div className="pt-14 min-h-screen bg-[hsl(var(--background))]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <SubNav group="client" rightSlot={user?.role === 'ADMIN' ? (<button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-md"><Plus size={16} /> 견적서 작성</button>) : undefined} />
                <ClientFilter clients={clients} selectedId={filterClientId} onSelect={setFilterClientId} />
                {qLoading ? (<div className="text-center py-12 text-[hsl(var(--muted-foreground))]">불러오는 중...</div>) : quotations.length === 0 ? (
                    <div className="text-center py-20 bg-[hsl(var(--card))] border border-dashed border-[hsl(var(--border))] rounded-xl">
                        <FileText size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                        <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">견적서가 없습니다</h3>
                        <p className="text-[hsl(var(--muted-foreground))] mt-2">첫 번째 견적서를 작성해보세요!</p>
                    </div>
                ) : (
                    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden shadow-sm">
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
                                {quotations.filter(q => filterClientId === 'all' || q.clientId === filterClientId).map(q => (
                                    <tr key={q.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] cursor-pointer transition-colors" onClick={() => handleDetail(q.id)}>
                                        <td className="p-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{q.quotationNumber}</td>
                                        <td className="p-3 font-medium text-[hsl(var(--foreground))]">{q.clientName}</td>
                                        <td className="p-3 text-[hsl(var(--foreground))]">{q.title}</td>
                                        <td className="p-3 text-right font-bold text-[hsl(var(--foreground))]">{q.totalAmount}만원</td>
                                        <td className="p-3 text-center text-[hsl(var(--muted-foreground))]">{q.contractMonths > 0 ? `${q.contractMonths}개월` : '단건'}</td>
                                        <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[q.status]}`}>{STATUS_LABELS[q.status]}</span></td>
                                        <td className="p-3 text-center text-xs text-[hsl(var(--muted-foreground))]">{new Date(q.createdAt).toLocaleDateString('ko-KR')}</td>
                                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2 justify-center">
                                                {user?.role === 'ADMIN' && <>
                                                    <button onClick={() => handleEdit(q)} className="p-1.5 hover:text-blue-600 hover:bg-blue-50 rounded text-[hsl(var(--muted-foreground))] transition-colors" title="편집">✏️</button>
                                                    {q.status !== 'approved' && (
                                                        <button onClick={() => handleDelete(q)} className="p-1.5 hover:text-red-600 hover:bg-red-50 rounded text-[hsl(var(--muted-foreground))] transition-colors" title="삭제"><Trash2 size={16} /></button>
                                                    )}
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

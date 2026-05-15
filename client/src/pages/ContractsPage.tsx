import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, ArrowLeft, Calendar, Building2, Download, Trash2 } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SubNav from '../components/SubNav';
import ClientFilter from '../components/ClientFilter';

type ContractStatus = 'draft' | 'signed' | 'active' | 'expired' | 'terminated';
interface Contract { id: number; contractNumber: string; quotationId?: number | null; clientId: number; clientName?: string; title: string; contractMonths: number; startDate?: string; endDate?: string; vatIncluded?: boolean; subtotal: number; discountAmount: number; totalAmount: number; monthlyAmount: number; notes?: string; commonTerms?: string; specialTerms?: string; status: ContractStatus; signedAt?: string; createdBy?: number | null; createdByName?: string; createdAt: string; updatedAt: string; quotationNumber?: string; }

const API = '/api/contracts';
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS_LABELS: Record<ContractStatus, string> = { draft: '초안', signed: '서명완료', active: '활성', expired: '만료', terminated: '해지' };
const STATUS_COLORS: Record<ContractStatus, string> = { draft: 'bg-gray-100 text-gray-700', signed: 'bg-blue-100 text-blue-700', active: 'bg-emerald-100 text-emerald-700', expired: 'bg-yellow-100 text-yellow-700', terminated: 'bg-red-100 text-red-700' };

const ContractsPage: React.FC = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const navigate = useNavigate();

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [detail, setDetail] = useState<Contract | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ title: '', startDate: '', endDate: '', notes: '', commonTerms: '', specialTerms: '' });
    const [renewMode, setRenewMode] = useState(false);
    const [renewForm, setRenewForm] = useState({ contractMonths: 6, startDate: '', endDate: '', title: '', notes: '', commonTerms: '', specialTerms: '' });
    const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
    const [filterClientId, setFilterClientId] = useState<number | 'all' | 'unassigned'>('all');
    const [searchParams] = useSearchParams();

    // URL ?clientId= 파라미터 수신 (거래처 카드 → 계약서 버튼)
    useEffect(() => {
        const cid = searchParams.get('clientId');
        if (cid) setFilterClientId(parseInt(cid));
    }, [searchParams]);

    // URL ?viewId= 파라미터 수신 (거래처 카드 → 연결된 계약서 직접 열기)
    const [autoViewId, setAutoViewId] = useState<number | null>(null);
    useEffect(() => {
        const vid = searchParams.get('viewId');
        if (vid) setAutoViewId(parseInt(vid));
    }, [searchParams]);

    // === TanStack Query 기반 데이터 페칭 ===
    const queryClient = useQueryClient();

    const { data: contractsData, isLoading: loading } = useQuery({
        queryKey: ['contracts'],
        queryFn: async () => {
            const res = await fetch(API, { headers: hdrs() });
            const data = await res.json();
            return data.success ? data.data : [];
        },
        staleTime: 60 * 1000,
    });
    const { data: clientsData } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => {
            const res = await fetch('/api/clients', { headers: hdrs() });
            const data = await res.json();
            return data.success ? data.data : [];
        },
        staleTime: 5 * 60 * 1000,
    });

    // 캐시 → 로컬 state 동기화
    useEffect(() => { if (contractsData) setContracts(contractsData); }, [contractsData]);
    useEffect(() => { if (clientsData) setClients(clientsData); }, [clientsData]);

    // fetchAll 대체 래퍼
    const fetchAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
        queryClient.invalidateQueries({ queryKey: ['clients'] });
    }, [queryClient]);


    // viewId 자동 열기
    useEffect(() => {
        if (autoViewId && contracts.length > 0 && view === 'list') {
            handleDetail(autoViewId);
            setAutoViewId(null);
        }
    }, [autoViewId, contracts, view]);

    const handleDetail = async (id: number) => {
        try {
            const res = await fetch(`${API}/${id}`, { headers: hdrs() });
            const data = await res.json();
            if (data.success) { setDetail(data.data); setView('detail'); setEditMode(false); setRenewMode(false); }
        } catch { toast.error('계약서 로드 실패'); }
    };

    const handleStatusChange = async (id: number, status: ContractStatus) => {
        if (status === 'active' && detail && !detail.startDate) {
            return toast.error('계약 시작일을 설정해주세요.');
        }
        try {
            const res = await fetch(`${API}/${id}/status`, { method: 'PUT', headers: hdrs(), body: JSON.stringify({ status }) });
            const data = await res.json();
            if (data.success) { toast.success(data.message); fetchAll(); handleDetail(id); }
            else toast.error(data.message);
        } catch { toast.error('상태 변경 실패'); }
    };

    const handleSaveEdit = async () => {
        if (!detail) return;
        try {
            const payload = {
                ...editForm,
                startDate: editForm.startDate || null,
                endDate: editForm.endDate || null,
            };
            const res = await fetch(`${API}/${detail.id}`, { method: 'PUT', headers: hdrs(), body: JSON.stringify(payload) });
            const data = await res.json();
            if (data.success) { toast.success(data.message); handleDetail(detail.id); setEditMode(false); fetchAll(); }
            else toast.error(data.message);
        } catch { toast.error('수정 실패'); }
    };

    const startEdit = () => {
        if (!detail) return;
        setEditForm({ title: detail.title, startDate: detail.startDate || '', endDate: detail.endDate || '', notes: detail.notes || '', commonTerms: detail.commonTerms || '', specialTerms: detail.specialTerms || '' });
        setEditMode(true);
    };

    const startRenew = () => {
        if (!detail) return;
        const today = new Date().toISOString().slice(0, 10);
        const months = detail.contractMonths || 6;
        const endD = new Date(today);
        endD.setMonth(endD.getMonth() + months);
        setRenewForm({
            contractMonths: months,
            startDate: today,
            endDate: endD.toISOString().slice(0, 10),
            title: detail.title,
            notes: detail.notes || '',
            commonTerms: detail.commonTerms || '',
            specialTerms: detail.specialTerms || '',
        });
        setRenewMode(true);
    };

    const handleRenew = async () => {
        if (!detail) return;
        if (!renewForm.startDate) return toast.error('계약 시작일을 설정해주세요.');
        try {
            const res = await fetch(`${API}/${detail.id}/renew`, { method: 'POST', headers: hdrs(), body: JSON.stringify(renewForm) });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                fetchAll();
                handleDetail(data.data.id); // 새 계약서로 이동
            } else toast.error(data.message);
        } catch { toast.error('계약 갱신 실패'); }
    };

    const handleDelete = async (ct: Contract) => {
        if (!['draft', 'signed'].includes(ct.status)) {
            return toast.error('진행 중인 계약서만 삭제할 수 있습니다.');
        }
        if (!confirm(`계약서 ${ct.contractNumber}을 완전히 삭제하시겠습니까?`)) return;
        
        try {
            const res = await fetch(`${API}/${ct.id}`, { method: 'DELETE', headers: hdrs() });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                if (view === 'detail' && detail?.id === ct.id) setView('list');
                fetchAll();
            } else toast.error(data.message);
        } catch { toast.error('삭제 실패'); }
    };

    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) return <div className="p-8 text-center text-red-500">접근 권한이 없습니다.</div>;

    // ===== 상세 뷰 =====
    if (view === 'detail' && detail) {
        return (
            <div className="max-w-4xl mx-auto p-6 pt-20 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('list')} className="p-2 hover:bg-[hsl(var(--accent))] rounded-lg"><ArrowLeft size={20} /></button>
                        <div>
                            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">계약서 {detail.contractNumber}</h1>
                            <p className="text-sm text-[hsl(var(--muted-foreground))]">{detail.clientName} · {new Date(detail.createdAt).toLocaleDateString('ko-KR')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span>
                        {!editMode && !renewMode && user?.role === 'ADMIN' && ['draft', 'signed'].includes(detail.status) && (
                            <button onClick={startEdit} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))]">✏️ 수정</button>
                        )}
                        {!editMode && !renewMode && user?.role === 'ADMIN' && detail.status === 'draft' && (
                            <button onClick={() => handleStatusChange(detail.id, 'signed')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">서명 완료</button>
                        )}
                        {!editMode && !renewMode && user?.role === 'ADMIN' && detail.status === 'signed' && (
                            <>
                                <button onClick={() => {
                                    if (confirm('서명을 취소하시겠습니까?')) handleStatusChange(detail.id, 'draft');
                                }} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]">서명 취소</button>
                                <button onClick={() => handleStatusChange(detail.id, 'active')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">계약 활성화</button>
                            </>
                        )}
                        {!editMode && !renewMode && user?.role === 'ADMIN' && detail.status === 'active' && (
                            <>
                                <button onClick={startRenew} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">🔄 계약 갱신</button>
                                <button onClick={() => handleStatusChange(detail.id, 'terminated')} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">계약 해지</button>
                            </>
                        )}
                        {!editMode && !renewMode && (
                            <button onClick={() => {
                                const el = document.getElementById('contract-pdf-area');
                                if (!el) return;
                                html2pdf().set({
                                    margin: 10,
                                    filename: `${detail.contractNumber}.pdf`,
                                    html2canvas: { scale: 2, useCORS: true },
                                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                                }).from(el).save();
                            }} className="px-3 py-1.5 border border-[hsl(var(--border))] rounded-lg text-sm hover:bg-[hsl(var(--accent))] flex items-center gap-1">
                                <Download size={14} /> PDF
                            </button>
                        )}
                        {!editMode && !renewMode && user?.role === 'ADMIN' && ['draft', 'signed'].includes(detail.status) && (
                            <button onClick={() => handleDelete(detail)} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 flex items-center gap-1 ml-2">
                                <Trash2 size={14} /> 삭제
                            </button>
                        )}
                    </div>
                </div>

                {/* 갱신 폼 */}
                {renewMode && (
                    <div className="bg-[hsl(var(--card))] border-2 border-indigo-300 rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-indigo-700">🔄 계약 갱신</h3>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">기존 계약을 만료 처리하고, 새 계약서를 즉시 활성화합니다. 거래처 정보도 자동 업데이트됩니다.</p>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">제목</label>
                            <input value={renewForm.title} onChange={e => setRenewForm({ ...renewForm, title: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">계약기간</label>
                                <select value={renewForm.contractMonths} onChange={e => {
                                    const m = parseInt(e.target.value);
                                    setRenewForm(prev => {
                                        if (m > 0 && prev.startDate) {
                                            const d = new Date(prev.startDate);
                                            d.setMonth(d.getMonth() + m);
                                            return { ...prev, contractMonths: m, endDate: d.toISOString().slice(0, 10) };
                                        }
                                        return { ...prev, contractMonths: m };
                                    });
                                }} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]">
                                    <option value={0}>단건 (1회성)</option>
                                    <option value={3}>3개월</option>
                                    <option value={6}>6개월</option>
                                    <option value={12}>12개월</option>
                                    <option value={24}>24개월</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">시작일</label>
                                <input type="date" value={renewForm.startDate} onChange={e => {
                                    const start = e.target.value;
                                    setRenewForm(prev => {
                                        if (prev.contractMonths > 0 && start) {
                                            const d = new Date(start);
                                            d.setMonth(d.getMonth() + prev.contractMonths);
                                            return { ...prev, startDate: start, endDate: d.toISOString().slice(0, 10) };
                                        }
                                        return { ...prev, startDate: start };
                                    });
                                }} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">종료일</label>
                                <input type="date" value={renewForm.endDate} onChange={e => setRenewForm({ ...renewForm, endDate: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">공통 계약 내용</label>
                            <textarea value={renewForm.commonTerms} onChange={e => setRenewForm({ ...renewForm, commonTerms: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] resize-y font-mono text-sm leading-relaxed" rows={4} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">특별 조항 <span className="text-xs text-blue-500">(업체별)</span></label>
                            <textarea value={renewForm.specialTerms} onChange={e => setRenewForm({ ...renewForm, specialTerms: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] resize-y font-mono text-sm leading-relaxed" rows={3} />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setRenewMode(false)} className="px-4 py-2 border border-[hsl(var(--border))] rounded-lg text-sm">취소</button>
                            <button onClick={handleRenew} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">🔄 계약 갱신 실행</button>
                        </div>
                    </div>
                )}

                {/* 수정 폼 */}
                {editMode && (
                    <div className="bg-[hsl(var(--card))] border border-blue-200 rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-blue-700">📝 계약서 수정</h3>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">제목</label>
                            <input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">계약 시작일</label>
                                <input type="date" value={editForm.startDate} onChange={e => {
                                    const start = e.target.value;
                                    setEditForm(prev => {
                                        if (detail.contractMonths > 0 && start) {
                                            const d = new Date(start);
                                            d.setMonth(d.getMonth() + detail.contractMonths);
                                            return { ...prev, startDate: start, endDate: d.toISOString().slice(0, 10) };
                                        }
                                        return { ...prev, startDate: start };
                                    });
                                }} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">계약 종료일</label>
                                <input type="date" value={editForm.endDate} onChange={e => setEditForm({ ...editForm, endDate: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))]" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">공통 계약 내용</label>
                            <textarea value={editForm.commonTerms} onChange={e => setEditForm({ ...editForm, commonTerms: e.target.value })} placeholder="모든 업체에 공통으로 적용되는 계약 내용을 입력하세요..." className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] resize-y font-mono text-sm leading-relaxed" rows={6} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">특별 조항 <span className="text-xs text-blue-500">(업체별)</span></label>
                            <textarea value={editForm.specialTerms} onChange={e => setEditForm({ ...editForm, specialTerms: e.target.value })} placeholder="해당 업체에만 적용되는 특별 조항을 입력하세요..." className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] resize-y font-mono text-sm leading-relaxed" rows={4} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">비고</label>
                            <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] resize-none" rows={2} />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditMode(false)} className="px-4 py-2 border border-[hsl(var(--border))] rounded-lg text-sm">취소</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">저장</button>
                        </div>
                    </div>
                )}

                {/* 계약 본문 (PDF 영역) */}
                <div id="contract-pdf-area" className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-8 space-y-6">
                    <div className="text-center border-b border-[hsl(var(--border))] pb-4">
                        <h2 className="text-2xl font-bold">{detail.title}</h2>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">계약번호: {detail.contractNumber}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2"><Building2 size={14} className="text-[hsl(var(--muted-foreground))]" /> <span className="text-[hsl(var(--muted-foreground))]">거래처:</span> <strong>{detail.clientName}</strong></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">계약기간:</span> <strong>{detail.contractMonths > 0 ? `${detail.contractMonths}개월` : '단건'}</strong></div>
                        {detail.startDate && <div className="flex items-center gap-2"><Calendar size={14} className="text-[hsl(var(--muted-foreground))]" /> <span className="text-[hsl(var(--muted-foreground))]">시작일:</span> <strong>{detail.startDate}</strong></div>}
                        {detail.endDate && <div className="flex items-center gap-2"><Calendar size={14} className="text-[hsl(var(--muted-foreground))]" /> <span className="text-[hsl(var(--muted-foreground))]">종료일:</span> <strong>{detail.endDate}</strong></div>}
                        <div><span className="text-[hsl(var(--muted-foreground))]">작성자:</span> {detail.createdByName}</div>
                        {detail.quotationNumber && <div><span className="text-[hsl(var(--muted-foreground))]">연결 견적서:</span> <button onClick={() => navigate('/quotations')} className="text-blue-600 underline">{detail.quotationNumber}</button></div>}
                        {detail.signedAt && <div><span className="text-[hsl(var(--muted-foreground))]">서명일:</span> {new Date(detail.signedAt).toLocaleDateString('ko-KR')}</div>}
                    </div>

                    <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2 text-right">
                        <div className="text-sm"><span className="text-[hsl(var(--muted-foreground))]">소계:</span> {detail.subtotal}만원</div>
                        {detail.discountAmount > 0 && <div className="text-sm text-red-500">할인: -{detail.discountAmount}만원</div>}
                        <div className="text-sm">공급가액: <strong>{detail.totalAmount}만원</strong></div>
                        <div className="text-sm text-[hsl(var(--muted-foreground))]">부가세 ({detail.vatIncluded !== false ? '10%' : '0%'}): <strong>{detail.vatIncluded !== false ? Math.round(detail.totalAmount * 0.1) : 0}만원</strong></div>
                        <div className="border-t border-[hsl(var(--border))] mt-2 pt-2">
                            <div className="text-lg font-bold text-[hsl(var(--foreground))]">
                                {detail.vatIncluded !== false ? '합계 (VAT 포함)' : '합계 (VAT 미포함)'}: {detail.totalAmount + (detail.vatIncluded !== false ? Math.round(detail.totalAmount * 0.1) : 0)}만원
                            </div>
                        </div>
                        {detail.contractMonths > 0 && <div className="text-lg font-bold text-blue-600">월 청구: {Math.round(detail.monthlyAmount * (detail.vatIncluded !== false ? 1.1 : 1))}만원/월 ({detail.vatIncluded !== false ? 'VAT 포함' : 'VAT 미포함'})</div>}
                    </div>
                    {detail.notes && <div className="bg-[hsl(var(--accent))] p-4 rounded-lg text-sm"><strong>비고:</strong> <span style={{whiteSpace: 'pre-wrap'}}>{detail.notes}</span></div>}

                    {detail.commonTerms && (
                        <div className="border-t border-[hsl(var(--border))] pt-4">
                            <h3 className="text-sm font-bold text-[hsl(var(--foreground))] mb-2">📋 공통 계약 내용</h3>
                            <div className="bg-[hsl(var(--accent))] p-4 rounded-lg text-sm leading-relaxed" style={{whiteSpace: 'pre-wrap'}}>{detail.commonTerms}</div>
                        </div>
                    )}
                    {detail.specialTerms && (
                        <div className="pt-3">
                            <h3 className="text-sm font-bold text-blue-600 mb-2">📌 특별 조항</h3>
                            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg text-sm leading-relaxed" style={{whiteSpace: 'pre-wrap'}}>{detail.specialTerms}</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ===== 목록 =====
    return (
        <div className="pt-14 min-h-screen bg-[hsl(var(--background))]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <SubNav group="client" />

                <ClientFilter
                    clients={clients}
                    selectedId={filterClientId}
                    onSelect={setFilterClientId}
                />

                {loading ? (
                    <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">불러오는 중...</div>
                ) : contracts.length === 0 ? (
                    <div className="text-center py-20 bg-[hsl(var(--card))] border border-dashed border-[hsl(var(--border))] rounded-xl">
                        <FileText size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                        <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">계약서가 없습니다</h3>
                        <p className="text-[hsl(var(--muted-foreground))] mt-2">견적서를 수락하여 계약서를 생성하세요.</p>
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
                                <th className="p-3 text-center font-semibold">견적서</th>
                                <th className="p-3 text-center font-semibold">작성일</th>
                                <th className="p-3 text-center font-semibold">관리</th>
                            </tr></thead>
                            <tbody>
                                {contracts
                                    .filter(ct => filterClientId === 'all' || ct.clientId === filterClientId)
                                    .map(ct => (
                                    <tr key={ct.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] cursor-pointer" onClick={() => handleDetail(ct.id)}>
                                        <td className="p-3 font-mono text-xs">{ct.contractNumber}</td>
                                        <td className="p-3 font-medium">{ct.clientName}</td>
                                        <td className="p-3">{ct.title}</td>
                                        <td className="p-3 text-right font-semibold">{ct.totalAmount}만원</td>
                                        <td className="p-3 text-center">{ct.contractMonths > 0 ? `${ct.contractMonths}개월` : '단건'}</td>
                                        <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[ct.status]}`}>{STATUS_LABELS[ct.status]}</span></td>
                                        <td className="p-3 text-center text-xs">{ct.quotationNumber || '-'}</td>
                                        <td className="p-3 text-center text-xs">{new Date(ct.createdAt).toLocaleDateString('ko-KR')}</td>
                                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2 justify-center">
                                                {user?.role === 'ADMIN' && ['draft', 'signed'].includes(ct.status) && (
                                                    <button onClick={() => handleDelete(ct)} className="p-1.5 hover:text-red-600 hover:bg-red-50 rounded text-[hsl(var(--muted-foreground))] transition-colors" title="삭제">
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
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

export default ContractsPage;

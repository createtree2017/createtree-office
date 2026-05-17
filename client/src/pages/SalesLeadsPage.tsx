import { Fragment, useMemo, useState } from 'react';
import { CheckSquare, Edit3, Mail, MessageSquare, Phone, Plus, Search, Send, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { SalesLead, useCreateSalesActivity, useSalesLeads, useUpdateSalesLead } from '../hooks/useSalesLeads';
import { useCreateSalesMaterial, useSalesMaterials, useSendSalesMessages } from '../hooks/useSalesMaterials';
import { MarketResearchItem, useUpdateMarketResearchItem } from '../hooks/useMarketResearch';

const SALES_STATUSES = [
    { value: 'all', label: '전체' },
    { value: 'not_contacted', label: '아직접촉안함' },
    { value: 'material_sent', label: '자료발송' },
    { value: 'called', label: '전화완료' },
    { value: 'visited', label: '방문완료' },
    { value: 'meeting_scheduled', label: '미팅예정' },
    { value: 'pilot_proposed', label: '파일럿제안' },
    { value: 'quotation_proposed', label: '견적제안' },
    { value: 'contracting', label: '계약진행', separatorAfter: true },
    { value: 'closed', label: '폐업' },
    { value: 'on_hold', label: '보류' },
    { value: 'rejected', label: '거절' },
    { value: 'unsubscribed', label: '수신거부', separatorAfter: true },
    { value: 'operating', label: '운영중' },
    { value: 'blacklisted', label: '블랙리스트' },
];

const ACTIVITY_TYPES = [
    { value: 'call', label: '전화' },
    { value: 'email', label: '메일' },
    { value: 'sns', label: 'SNS' },
    { value: 'visit', label: '방문' },
    { value: 'meeting', label: '미팅' },
    { value: 'feedback', label: '피드백' },
    { value: 'memo', label: '메모' },
];

const BUSINESS_TYPES = [
    { value: 'delivery_hospital', label: '분만병원' },
    { value: 'general_obgyn', label: '일반 산부인과' },
    { value: 'women_hospital', label: '여성병원' },
    { value: 'postpartum_center', label: '산후조리원' },
    { value: 'obgyn', label: '산부인과' },
];

const OPERATION_STATUSES = [
    { value: 'operating', label: '운영중' },
    { value: 'newly_opened', label: '신규개원' },
    { value: 'closed', label: '폐업' },
    { value: 'unknown', label: '확인필요' },
];

function businessLabel(value?: string | null) {
    const labels: Record<string, string> = {
        delivery_hospital: '분만병원',
        general_obgyn: '일반 산부인과',
        women_hospital: '여성병원',
        postpartum_center: '산후조리원',
        obgyn: '산부인과',
    };
    return value ? labels[value] || value : '-';
}

function getNaverPlaceUrl(item?: MarketResearchItem | null) {
    const manualUrl = String(item?.rawData?.manualNaverPlaceUrl || '');
    const autoUrl = String(item?.rawData?.naverPlaceUrl || '');
    if (manualUrl.includes('map.naver.com/p/entry/place/')) return manualUrl;
    if (autoUrl.includes('map.naver.com/p/entry/place/')) return autoUrl;
    return null;
}

function getStatusFilterClass(value: string, active: boolean) {
    if (value === 'operating') {
        return active
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-700';
    }
    if (value === 'blacklisted') {
        return active
            ? 'bg-rose-600 text-white border-rose-600'
            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-900/25 dark:text-rose-200 dark:border-rose-700';
    }
    return active
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

const SalesLeadsPage = () => {
    const [filters, setFilters] = useState({ q: '', status: ['all'], businessType: 'all', region: 'all' });
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [activityLead, setActivityLead] = useState<SalesLead | null>(null);
    const [activityForm, setActivityForm] = useState({ activityType: 'call', subject: '', content: '', outcome: '', nextAction: '' });
    const [editingLead, setEditingLead] = useState<SalesLead | null>(null);
    const [itemEditForm, setItemEditForm] = useState<Partial<MarketResearchItem>>({});
    const [sendOpen, setSendOpen] = useState(false);
    const [messageForm, setMessageForm] = useState({
        subject: '[창조트리기획] {병원명} 산모 고객관리 AI문화센터 제안',
        body: '안녕하세요. {병원명} {담당자}\n\n산부인과/여성병원을 위한 임산부 문화센터와 AI 이미지 이벤트 운영 제안을 드립니다.\n검토 가능한 소개자료를 함께 전달드립니다.',
        materialIds: [] as number[],
    });
    const [materialForm, setMaterialForm] = useState({ title: '', externalUrl: '' });

    const { data: leads = [], isLoading } = useSalesLeads(filters);
    const { data: materials = [] } = useSalesMaterials();
    const updateLead = useUpdateSalesLead();
    const updateItem = useUpdateMarketResearchItem();
    const createActivity = useCreateSalesActivity();
    const createMaterial = useCreateSalesMaterial();
    const sendMessages = useSendSalesMessages();

    const summary = useMemo(() => ({
        total: leads.length,
        notContacted: leads.filter(lead => lead.status === 'not_contacted').length,
        materialSent: leads.filter(lead => lead.status === 'material_sent').length,
        meeting: leads.filter(lead => ['meeting_scheduled', 'pilot_proposed', 'quotation_proposed', 'contracting'].includes(lead.status)).length,
    }), [leads]);

    const toggleSelectedId = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
    };

    const displayedLeadIds = useMemo(() => leads.map(lead => lead.id), [leads]);
    const allDisplayedSelected = displayedLeadIds.length > 0 && displayedLeadIds.every(id => selectedIds.includes(id));

    const toggleDisplayedSelection = () => {
        setSelectedIds(allDisplayedSelected ? [] : displayedLeadIds);
    };

    const toggleStatusFilter = (status: string) => {
        setFilters(prev => {
            if (status === 'all') return { ...prev, status: ['all'] };

            const currentStatuses = prev.status.filter(value => value !== 'all');
            const nextStatuses = currentStatuses.includes(status)
                ? currentStatuses.filter(value => value !== status)
                : [...currentStatuses, status];

            return { ...prev, status: nextStatuses.length > 0 ? nextStatuses : ['all'] };
        });
    };

    const handleStatusChange = async (lead: SalesLead, status: string) => {
        try {
            await updateLead.mutateAsync({ id: lead.id, payload: { status } });
            toast.success('영업상태가 변경되었습니다.');
        } catch (error: any) {
            toast.error(error.message || '상태 변경 실패');
        }
    };

    const handleCreateActivity = async () => {
        if (!activityLead) return;
        try {
            await createActivity.mutateAsync({ leadId: activityLead.id, payload: activityForm });
            setActivityLead(null);
            setActivityForm({ activityType: 'call', subject: '', content: '', outcome: '', nextAction: '' });
            toast.success('영업활동을 기록했습니다.');
        } catch (error: any) {
            toast.error(error.message || '영업활동 기록 실패');
        }
    };

    const openItemEdit = (lead: SalesLead) => {
        if (!lead.item) return toast.error('수정할 업체 정보가 없습니다.');
        setEditingLead(lead);
        setItemEditForm({
            businessType: lead.item.businessType,
            name: lead.item.name,
            region: lead.item.region,
            city: lead.item.city,
            district: lead.item.district,
            address: lead.item.address,
            operationStatus: lead.item.operationStatus,
            phone: lead.item.phone,
            email: lead.item.email,
            website: lead.item.website,
            instagram: lead.item.instagram,
            blog: lead.item.blog,
            memo: lead.item.memo,
        });
    };

    const handleSaveItemEdit = async () => {
        if (!editingLead?.item) return;
        if (!String(itemEditForm.name || '').trim()) return toast.error('업체명을 입력해주세요.');
        if (!String(itemEditForm.region || '').trim()) return toast.error('지역을 입력해주세요.');

        const optionalKeys: Array<keyof MarketResearchItem> = ['city', 'district', 'address', 'phone', 'email', 'website', 'instagram', 'blog', 'memo'];
        const payload: Partial<MarketResearchItem> = {
            ...itemEditForm,
            name: String(itemEditForm.name || '').trim(),
            region: String(itemEditForm.region || '').trim(),
            verificationStatus: 'manually_corrected',
        };
        for (const key of optionalKeys) {
            const value = payload[key];
            if (typeof value === 'string') {
                (payload as any)[key] = value.trim() || null;
            }
        }

        try {
            await updateItem.mutateAsync({ id: editingLead.item.id, payload });
            setEditingLead(null);
            setItemEditForm({});
            toast.success('업체 정보를 수정했습니다.');
        } catch (error: any) {
            toast.error(error.message || '업체 정보 수정 실패');
        }
    };

    const handleCreateMaterial = async () => {
        if (!materialForm.title.trim()) return toast.error('자료명을 입력해주세요.');
        try {
            await createMaterial.mutateAsync({ title: materialForm.title.trim(), externalUrl: materialForm.externalUrl.trim() || undefined });
            setMaterialForm({ title: '', externalUrl: '' });
            toast.success('영업자료가 등록되었습니다.');
        } catch (error: any) {
            toast.error(error.message || '자료 등록 실패');
        }
    };

    const handleSendMessages = async () => {
        if (selectedIds.length === 0) return toast.error('발송할 업체를 선택해주세요.');
        try {
            const result = await sendMessages.mutateAsync({
                leadIds: selectedIds,
                materialIds: messageForm.materialIds,
                subject: messageForm.subject,
                body: messageForm.body,
            });
            const blocked = result.filter((row: any) => row.status === 'blocked').length;
            const sent = result.filter((row: any) => row.status === 'sent').length;
            const draft = result.filter((row: any) => row.status === 'draft').length;
            toast.success(`발송 처리 완료: 발송 ${sent}, 초안 ${draft}, 차단 ${blocked}`);
            setSendOpen(false);
        } catch (error: any) {
            toast.error(error.message || '발송 처리 실패');
        }
    };

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-4 md:p-8 lg:p-10 pt-20">
            <div className="max-w-[1500px] mx-auto space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200 text-xs font-bold mb-3">
                            <Users size={13} />
                            영업관리
                        </div>
                        <h1 className="text-3xl font-black tracking-tight">영업선택업체</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">시장조사에서 선택한 업체만 모아 영업상태, 활동 이력, 자료 발송을 관리합니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSendOpen(true)} disabled={selectedIds.length === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                            <Send size={16} />
                            자료 발송 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        ['전체', summary.total],
                        ['미접촉', summary.notContacted],
                        ['자료발송', summary.materialSent],
                        ['미팅/계약권', summary.meeting],
                    ].map(([label, value]) => (
                        <div key={label} className="bento-card p-4">
                            <p className="text-xs font-bold text-slate-400 mb-1">{label}</p>
                            <p className="text-2xl font-black">{value}</p>
                        </div>
                    ))}
                </div>

                <div className="bento-card p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                        {SALES_STATUSES.map(status => (
                            <Fragment key={status.value}>
                                <button
                                    onClick={() => toggleStatusFilter(status.value)}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${getStatusFilterClass(status.value, filters.status.includes(status.value))}`}
                                >
                                    {status.label}
                                </button>
                                {status.separatorAfter && (
                                    <span className="self-center px-1 text-slate-300 dark:text-slate-600" aria-hidden="true">ㅣ</span>
                                )}
                            </Fragment>
                        ))}
                    </div>
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={filters.q}
                            onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))}
                            placeholder="업체명, 주소, 연락처, 메모 검색"
                            className="pl-9 pr-3 py-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                    </div>
                </div>

                <div className="bento-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                {isLoading ? '불러오는 중...' : `${leads.length}개 영업선택업체`}
                                {selectedIds.length > 0 && <span className="ml-2 text-blue-600 dark:text-blue-300">{selectedIds.length}개 선택</span>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedIds(displayedLeadIds)}
                                    disabled={isLoading || displayedLeadIds.length === 0 || allDisplayedSelected}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
                                >
                                    <CheckSquare size={15} />
                                    전체선택 {displayedLeadIds.length > 0 ? `(${displayedLeadIds.length})` : ''}
                                </button>
                                <button
                                    onClick={() => setSelectedIds([])}
                                    disabled={selectedIds.length === 0}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    <X size={15} />
                                    선택해제
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1200px] text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/70 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-3 py-3">
                                        <button
                                            onClick={toggleDisplayedSelection}
                                            disabled={displayedLeadIds.length === 0}
                                            className="text-slate-400 hover:text-emerald-600 disabled:opacity-40"
                                            title={allDisplayedSelected ? '표시 목록 선택해제' : '표시 목록 전체선택'}
                                        >
                                            {allDisplayedSelected ? <CheckSquare size={18} /> : <span className="block w-[18px] h-[18px] border-2 border-current rounded" />}
                                        </button>
                                    </th>
                                    <th className="px-3 py-3">업체</th>
                                    <th className="px-3 py-3">분류/지역</th>
                                    <th className="px-3 py-3">연락처</th>
                                    <th className="px-3 py-3">영업상태</th>
                                    <th className="px-3 py-3">다음액션</th>
                                    <th className="px-3 py-3">메모</th>
                                    <th className="px-3 py-3 text-right">활동</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {leads.map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="px-3 py-4">
                                            <button onClick={() => toggleSelectedId(lead.id)} className="text-slate-400 hover:text-emerald-600">
                                                {selectedIds.includes(lead.id) ? <CheckSquare size={18} /> : <span className="block w-[18px] h-[18px] border-2 border-current rounded" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-4">
                                            <div className="font-black text-slate-900 dark:text-white">{lead.item?.name || '-'}</div>
                                            <div className="text-xs text-slate-400 max-w-[260px] truncate">{lead.item?.address || '-'}</div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div className="font-bold">{businessLabel(lead.item?.businessType)}</div>
                                            <div className="text-slate-400">{[lead.item?.region, lead.item?.district].filter(Boolean).join(' ')}</div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div className="flex items-center gap-1"><Phone size={12} /> {lead.item?.phone || '-'}</div>
                                            <div className="flex items-center gap-1"><Mail size={12} /> {lead.item?.email || '-'}</div>
                                            <div className="mt-1 flex max-w-[220px] flex-wrap gap-x-2 gap-y-0.5">
                                                {lead.item?.website && <a href={lead.item.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">홈페이지</a>}
                                                {lead.item?.blog && <a href={lead.item.blog} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">블로그</a>}
                                                {lead.item?.instagram && <a href={lead.item.instagram} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">인스타그램</a>}
                                                {getNaverPlaceUrl(lead.item)
                                                    ? <a href={getNaverPlaceUrl(lead.item)!} target="_blank" rel="noreferrer" className="text-green-700 hover:underline dark:text-green-300">네이버플레이스</a>
                                                    : <span className="text-slate-400">플레이스 없음</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <select
                                                value={lead.status}
                                                onChange={e => handleStatusChange(lead, e.target.value)}
                                                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                                            >
                                                {SALES_STATUSES.filter(status => status.value !== 'all').map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div>{lead.nextAction || '-'}</div>
                                            <div className="text-slate-400">{lead.nextActionDate ? new Date(lead.nextActionDate).toLocaleDateString('ko-KR') : ''}</div>
                                        </td>
                                        <td className="px-3 py-4 text-xs max-w-[220px] truncate">{lead.notes || '-'}</td>
                                        <td className="px-3 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => openItemEdit(lead)} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" title="업체정보 수정">
                                                    <Edit3 size={15} />
                                                </button>
                                                <button onClick={() => { setActivityLead(lead); setActivityForm(prev => ({ ...prev, activityType: 'call' })); }} className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300" title="활동 기록">
                                                    <MessageSquare size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!isLoading && leads.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-400">영업선택업체가 없습니다. 시장조사 결과에서 업체를 선택해 저장하세요.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {activityLead && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActivityLead(null)}>
                    <div className="w-full max-w-lg bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-lg font-black">{activityLead.item?.name} 활동 기록</h2>
                            <button onClick={() => setActivityLead(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <select value={activityForm.activityType} onChange={e => setActivityForm(prev => ({ ...prev, activityType: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                                {ACTIVITY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                            <input value={activityForm.subject} onChange={e => setActivityForm(prev => ({ ...prev, subject: e.target.value }))} placeholder="제목/요약" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                            <textarea value={activityForm.content} onChange={e => setActivityForm(prev => ({ ...prev, content: e.target.value }))} placeholder="통화/방문/피드백 내용" className="w-full min-h-28 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                            <input value={activityForm.outcome} onChange={e => setActivityForm(prev => ({ ...prev, outcome: e.target.value }))} placeholder="결과" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                            <input value={activityForm.nextAction} onChange={e => setActivityForm(prev => ({ ...prev, nextAction: e.target.value }))} placeholder="다음 액션" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                            <button onClick={() => setActivityLead(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">취소</button>
                            <button onClick={handleCreateActivity} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">기록</button>
                        </div>
                    </div>
                </div>
            )}

            {editingLead && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingLead(null)}>
                    <div className="w-full max-w-2xl bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">업체정보 수정</p>
                                <h2 className="text-lg font-black">{editingLead.item?.name || '-'}</h2>
                            </div>
                            <button onClick={() => setEditingLead(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">업체명</span>
                                <input value={itemEditForm.name || ''} onChange={e => setItemEditForm(prev => ({ ...prev, name: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">분류</span>
                                <select value={itemEditForm.businessType || 'general_obgyn'} onChange={e => setItemEditForm(prev => ({ ...prev, businessType: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30">
                                    {BUSINESS_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">운영상태</span>
                                <select value={itemEditForm.operationStatus || 'unknown'} onChange={e => setItemEditForm(prev => ({ ...prev, operationStatus: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30">
                                    {OPERATION_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                                </select>
                            </label>
                            {[
                                ['region', '지역'],
                                ['city', '시/도'],
                                ['district', '구/군'],
                                ['phone', '전화번호'],
                                ['email', '이메일'],
                                ['website', '홈페이지'],
                                ['instagram', '인스타그램'],
                                ['blog', '블로그'],
                            ].map(([key, label]) => (
                                <label key={key} className="flex flex-col gap-1.5">
                                    <span className="text-xs font-bold text-slate-400">{label}</span>
                                    <input value={(itemEditForm as any)[key] || ''} onChange={e => setItemEditForm(prev => ({ ...prev, [key]: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
                                </label>
                            ))}
                            <label className="md:col-span-2 flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">주소</span>
                                <input value={itemEditForm.address || ''} onChange={e => setItemEditForm(prev => ({ ...prev, address: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </label>
                            <label className="md:col-span-2 flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">업체 메모</span>
                                <textarea value={itemEditForm.memo || ''} onChange={e => setItemEditForm(prev => ({ ...prev, memo: e.target.value }))} className="min-h-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </label>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                            <button onClick={() => setEditingLead(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">취소</button>
                            <button onClick={handleSaveItemEdit} disabled={updateItem.isPending} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
                                {updateItem.isPending ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {sendOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSendOpen(false)}>
                    <div className="w-full max-w-2xl bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-lg font-black">영업자료 발송</h2>
                            <button onClick={() => setSendOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                                <input value={materialForm.title} onChange={e => setMaterialForm(prev => ({ ...prev, title: e.target.value }))} placeholder="새 영업자료명" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                                <button onClick={handleCreateMaterial} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-bold">
                                    <Plus size={14} /> 자료등록
                                </button>
                                <input value={materialForm.externalUrl} onChange={e => setMaterialForm(prev => ({ ...prev, externalUrl: e.target.value }))} placeholder="Drive/외부 링크" className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {materials.map(material => (
                                    <button
                                        key={material.id}
                                        onClick={() => setMessageForm(prev => ({ ...prev, materialIds: prev.materialIds.includes(material.id) ? prev.materialIds.filter(id => id !== material.id) : [...prev.materialIds, material.id] }))}
                                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${messageForm.materialIds.includes(material.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}
                                    >
                                        {material.title}
                                    </button>
                                ))}
                            </div>
                            <input value={messageForm.subject} onChange={e => setMessageForm(prev => ({ ...prev, subject: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                            <textarea value={messageForm.body} onChange={e => setMessageForm(prev => ({ ...prev, body: e.target.value }))} className="w-full min-h-44 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                            <p className="text-xs text-slate-400">메일 발송 설정이 없거나 이메일 없음/폐업/수신거부 업체는 발송하지 않고 초안 또는 차단 이력으로 저장됩니다.</p>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                            <button onClick={() => setSendOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">취소</button>
                            <button onClick={handleSendMessages} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">
                                <Send size={15} /> 발송 처리
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesLeadsPage;

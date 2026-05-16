import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckSquare, Database, Download, Edit3, Filter, Play, RefreshCw, Save, Search, Square, Star, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    downloadMarketResearchExcel,
    fetchMarketResearchItemIds,
    MarketResearchItem,
    useBatchSelectMarketResearchItems,
    useCreateMarketResearchRun,
    useMarketResearchItems,
    useMarketResearchRuns,
    useMarketResearchSummary,
    useSelectMarketResearchItem,
    useUnselectMarketResearchItem,
    useUpdateMarketResearchItem,
} from '../hooks/useMarketResearch';

const BUSINESS_TYPES = [
    { value: 'obgyn', label: '산부인과 보유기관' },
    { value: 'delivery_hospital', label: '분만병원' },
    { value: 'general_obgyn', label: '일반 산부인과' },
    { value: 'women_hospital', label: '여성병원' },
    { value: 'postpartum_center', label: '산후조리원' },
];

const REGIONS = ['전국', '서울', '경기', '인천', '대전', '부산', '대구', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

const OPERATION_STATUSES = [
    { value: 'all', label: '전체' },
    { value: 'operating', label: '운영중' },
    { value: 'closed', label: '폐업' },
    { value: 'newly_opened', label: '신규개업' },
    { value: 'unknown', label: '확인필요' },
];

const FLAGS = [
    { value: 'all', label: '전체' },
    { value: 'selected', label: '영업선택' },
    { value: 'new', label: '신규업체' },
    { value: 'updated', label: '업데이트' },
    { value: 'unselected', label: '미선택' },
];

const PRIMARY_FILTERS = [
    { value: 'delivery_obgyn', label: '분만산부인과', description: '분만병원 후보', view: 'delivery_candidates', businessType: 'all' },
    { value: 'general_obgyn', label: '일반산부인과', description: '일반 산부인과 목록', view: 'all', businessType: 'general_obgyn' },
    { value: 'postpartum_center', label: '산후조리원', description: '산후조리원 목록', view: 'all', businessType: 'postpartum_center' },
    { value: 'detail_candidates', label: '상세조사후보', description: 'HIRA 상세조사 대상', view: 'detail_candidates', businessType: 'all' },
    { value: 'all', label: '전체원본', description: '전체 원본 데이터', view: 'all', businessType: 'all' },
];

const PAGE_SIZE = 50;

function businessLabel(value: string) {
    return BUSINESS_TYPES.find(item => item.value === value)?.label || value;
}

function operationLabel(value: string) {
    return OPERATION_STATUSES.find(item => item.value === value)?.label || value;
}

function StatusBadges({ item }: { item: MarketResearchItem }) {
    const badges = [
        item.isSelected && { label: '저장중', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700' },
        item.isNew && { label: '신규업체', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700' },
        item.hasUpdates && { label: '업데이트', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700' },
    ].filter(Boolean) as Array<{ label: string; className: string }>;
    if (badges.length === 0) return <span className="text-slate-300 dark:text-slate-600">-</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {badges.map(badge => (
                <span key={badge.label} className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${badge.className}`}>{badge.label}</span>
            ))}
        </div>
    );
}

function getDeliveryCandidate(item: MarketResearchItem) {
    return item.rawData?.deliveryCandidate || {};
}

function isDeliveryCandidateItem(item: MarketResearchItem) {
    if (item.rawData?.manualDeliveryCandidate !== undefined) return item.rawData.manualDeliveryCandidate === true;
    return item.isDeliveryHospital || (getDeliveryCandidate(item).score ?? 0) >= 3;
}

function deliveryGradeLabel(value?: string) {
    if (value === 'strong_candidate') return '강력 후보';
    if (value === 'candidate') return '분만 후보';
    if (value === 'review') return '검토 후보';
    if (value === 'low_priority') return '낮은 우선';
    return '미조사';
}

function getDoctorCount(item: MarketResearchItem, department: string) {
    const candidate = getDeliveryCandidate(item);
    if (department === '산부인과') return candidate.obgynDoctorCount ?? item.doctorCounts?.[department] ?? null;
    if (department === '소아청소년과') return candidate.pediatricDoctorCount ?? item.doctorCounts?.[department] ?? null;
    return item.doctorCounts?.[department] ?? null;
}

function getNaverPlaceUrl(item: MarketResearchItem) {
    const manualUrl = String(item.rawData?.manualNaverPlaceUrl || '');
    const autoUrl = String(item.rawData?.naverPlaceUrl || '');
    if (manualUrl.includes('map.naver.com/p/entry/place/')) return manualUrl;
    if (autoUrl.includes('map.naver.com/p/entry/place/')) return autoUrl;
    return null;
}

function researchStageLabel(stage?: string) {
    const labels: Record<string, string> = {
        starting: '시작 준비',
        hira_base: 'HIRA 기본목록 수집',
        hira_departments: 'HIRA 진료과/전문의 조회',
        hira_equipment: 'HIRA 의료장비 조회',
        naver_enrichment: '네이버 후보 보강',
        drive_csv: '산후조리원 CSV 병합',
        collected: '수집 결과 정리',
        saving: 'DB 저장',
        completed: '완료',
        partial_failed: '부분 완료',
        failed: '실패',
        interrupted: '중단 처리',
    };
    return labels[stage || ''] || '진행 중';
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${active
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                }`}
        >
            {label}
        </button>
    );
}

const MarketResearchPage = () => {
    const navigate = useNavigate();
    const [filters, setFilters] = useState({ q: '', businessType: 'all', region: '전국', operationStatus: 'all', flag: 'all' });
    const [primaryFilter, setPrimaryFilter] = useState('delivery_obgyn');
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [editingItem, setEditingItem] = useState<MarketResearchItem | null>(null);
    const [editForm, setEditForm] = useState<Partial<MarketResearchItem>>({});

    const { data: runs = [], isLoading: runsLoading } = useMarketResearchRuns();
    const latestRun = runs[0];
    const latestRunId = latestRun?.id;
    const latestRunStatus = latestRun?.status;
    const researchInProgress = latestRunStatus === 'running' || latestRunStatus === 'pending';
    const runStats = latestRun?.stats || {};
    const runProcessed = Number(runStats.processed || 0);
    const runTotal = Number(runStats.total || 0);
    const runProgressPercent = runTotal > 0 ? Math.min(100, Math.round((runProcessed / runTotal) * 100)) : 0;
    const activePrimaryFilter = PRIMARY_FILTERS.find(item => item.value === primaryFilter) || PRIMARY_FILTERS[0];
    const effectiveFilters = useMemo(() => ({
        ...filters,
        businessType: activePrimaryFilter.businessType,
    }), [filters, activePrimaryFilter.businessType]);
    const listFilters = useMemo(() => ({ ...effectiveFilters, view: activePrimaryFilter.view, page, pageSize: PAGE_SIZE }), [effectiveFilters, activePrimaryFilter.view, page]);
    const exportFilters = useMemo(() => ({ ...effectiveFilters, view: activePrimaryFilter.view }), [effectiveFilters, activePrimaryFilter.view]);
    const { data: itemsResult, isLoading, refetch: refetchItems } = useMarketResearchItems(listFilters, researchInProgress);
    const { data: summaryData } = useMarketResearchSummary(listFilters, researchInProgress);
    const items = useMemo(() => itemsResult?.items ?? [], [itemsResult?.items]);
    const meta = itemsResult?.meta || { total: 0, page, pageSize: PAGE_SIZE, totalPages: 1 };
    const createRun = useCreateMarketResearchRun();
    const batchSelectItems = useBatchSelectMarketResearchItems();
    const selectItem = useSelectMarketResearchItem();
    const unselectItem = useUnselectMarketResearchItem();
    const updateItem = useUpdateMarketResearchItem();

    const summary = summaryData || {
        total: 0,
        selected: 0,
        newItems: 0,
        updated: 0,
        deliveryCandidates: 0,
        closed: 0,
        verifiedObgyn: 0,
        detailCandidates: 0,
    };

    useEffect(() => {
        if (latestRunId && latestRunStatus && ['completed', 'partial_failed', 'failed'].includes(latestRunStatus)) {
            refetchItems();
        }
    }, [latestRunId, latestRunStatus, refetchItems]);

    useEffect(() => {
        setPage(1);
        setSelectedIds([]);
    }, [filters, primaryFilter]);

    const toggleSelectedId = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
    };

    const pageItemIds = useMemo(() => items.map(item => item.id), [items]);
    const allPageSelected = pageItemIds.length > 0 && pageItemIds.every(id => selectedIds.includes(id));

    const togglePageSelection = () => {
        if (allPageSelected) {
            setSelectedIds(prev => prev.filter(id => !pageItemIds.includes(id)));
            return;
        }
        setSelectedIds(prev => [...new Set([...prev, ...pageItemIds])]);
    };

    const handleSelectAllFiltered = async () => {
        try {
            const ids = await fetchMarketResearchItemIds(exportFilters);
            setSelectedIds(ids);
            toast.success(`${ids.length}개 업체를 전체선택했습니다.`);
        } catch (error: any) {
            toast.error(error.message || '전체선택 실패');
        }
    };

    const handleRunResearch = async () => {
        try {
            await createRun.mutateAsync({
                title: `시장조사 ${new Date().toLocaleDateString('ko-KR')}`,
                regionScope: filters.region,
                regions: filters.region === '전국' ? [] : [filters.region],
                businessTypes: effectiveFilters.businessType === 'all' ? ['obgyn', 'postpartum_center'] : [effectiveFilters.businessType],
                operationStatuses: filters.operationStatus === 'all' ? [] : [filters.operationStatus],
            });
            toast.success('시장조사가 완료되었습니다.');
        } catch (error: any) {
            toast.error(error.message || '시장조사 실행 실패');
        }
    };

    const handleBatchSelect = async () => {
        if (selectedIds.length === 0) return toast.error('선택한 업체가 없습니다.');
        try {
            const result = await batchSelectItems.mutateAsync(selectedIds);
            setSelectedIds([]);
            toast.success(`${result.selected}개 업체를 영업선택업체로 저장했습니다.`);
        } catch (error: any) {
            toast.error(error.message || '일괄 저장 실패');
        }
    };

    const handleSaveEdit = async () => {
        if (!editingItem) return;
        try {
            await updateItem.mutateAsync({ id: editingItem.id, payload: editForm });
            setEditingItem(null);
            setEditForm({});
            toast.success('조사 항목을 수정했습니다.');
        } catch (error: any) {
            toast.error(error.message || '수정 실패');
        }
    };

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-4 md:p-8 lg:p-10 pt-20">
            <div className="max-w-[1600px] mx-auto space-y-6">
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 text-xs font-bold mb-3">
                            <Database size={13} />
                            시장조사
                        </div>
                        <h1 className="text-3xl font-black tracking-tight">시장조사 결과</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">조사된 전체 업체에서 영업할 병원/조리원을 선택하고, 재조사 업데이트를 확인합니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => downloadMarketResearchExcel(exportFilters).catch((err) => toast.error(err.message))} className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200">
                            <Download size={16} />
                            엑셀 다운로드
                        </button>
                        <button onClick={handleRunResearch} disabled={createRun.isPending || researchInProgress} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                            {createRun.isPending || researchInProgress ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                            {createRun.isPending || researchInProgress ? '시장조사 진행 중' : '시장조사 실행'}
                        </button>
                    </div>
                </div>

                {researchInProgress && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                        <div className="flex flex-wrap items-center gap-2">
                            <RefreshCw size={16} className="animate-spin" />
                            <span>시장조사가 진행 중입니다.</span>
                            <span className="text-blue-500 dark:text-blue-300">
                                {researchStageLabel(String(runStats.stage || latestRunStatus))}
                                {runTotal > 0 ? ` · ${runProcessed.toLocaleString()} / ${runTotal.toLocaleString()} (${runProgressPercent}%)` : ''}
                            </span>
                        </div>
                        {runTotal > 0 && (
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${runProgressPercent}%` }} />
                            </div>
                        )}
                        <div className="mt-2 text-xs font-medium text-blue-500 dark:text-blue-300">
                            HIRA 기본 {Number(runStats.hiraBaseCount || 0).toLocaleString()} · 진료과 {Number(runStats.hiraDetailProcessed || 0).toLocaleString()} · 장비 {Number(runStats.equipmentProcessed || 0).toLocaleString()} · 분만후보 {Number(runStats.deliveryCandidateCount || 0).toLocaleString()} · 네이버 {Number(runStats.naverProcessed || 0).toLocaleString()} · 오류 {Number(runStats.errors || 0).toLocaleString()}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {[
                        ['전체', summary.total, 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'],
                        ['영업선택', summary.selected, 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'],
                        ['신규업체', summary.newItems, 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'],
                        ['업데이트', summary.updated, 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'],
                        ['분만후보', summary.deliveryCandidates, 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200'],
                        ['폐업', summary.closed, 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'],
                    ].map(([label, value, className]) => (
                        <div key={label} className="bento-card p-4">
                            <p className="text-xs font-bold text-slate-400 mb-1">{label}</p>
                            <p className={`inline-flex px-2 py-1 rounded-lg text-xl font-black ${className}`}>{value}</p>
                        </div>
                    ))}
                </div>

                <div className="bento-card p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200">
                        <Filter size={16} />
                        조사 필터
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                        {PRIMARY_FILTERS.map(item => (
                            <button
                                key={item.value}
                                onClick={() => setPrimaryFilter(item.value)}
                                className={`text-left rounded-xl border px-4 py-3 transition-all ${primaryFilter === item.value
                                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-100'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                    }`}
                            >
                                <div className="text-sm font-black">{item.label}</div>
                                <div className="mt-1 text-[11px] opacity-75">{item.description}</div>
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {REGIONS.map(region => <FilterButton key={region} active={filters.region === region} label={region} onClick={() => setFilters(prev => ({ ...prev, region }))} />)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {OPERATION_STATUSES.map(item => <FilterButton key={item.value} active={filters.operationStatus === item.value} label={item.label} onClick={() => setFilters(prev => ({ ...prev, operationStatus: item.value }))} />)}
                    </div>
                    <div className="flex flex-col md:flex-row gap-3 md:items-center">
                        <div className="flex flex-wrap gap-2">
                            {FLAGS.map(item => <FilterButton key={item.value} active={filters.flag === item.value} label={item.label} onClick={() => setFilters(prev => ({ ...prev, flag: item.value }))} />)}
                        </div>
                        <div className="relative md:ml-auto">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={filters.q}
                                onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))}
                                placeholder="상호, 주소, 전화, 이메일 검색"
                                className="pl-9 pr-3 py-2 w-full md:w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                            />
                        </div>
                    </div>
                </div>

                <div className="bento-card overflow-hidden">
                    <div className="space-y-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                {isLoading ? '불러오는 중...' : `${meta.total.toLocaleString()}개 중 ${items.length}개 표시`}
                            </div>
                            <div className="text-xs text-slate-400">
                                최근 실행: {runsLoading ? '확인 중' : latestRun ? `${latestRun.title} · ${latestRun.status}` : '없음'}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={handleSelectAllFiltered} className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-bold text-blue-700 dark:text-blue-200 disabled:opacity-50" disabled={isLoading || meta.total === 0}>
                                <CheckSquare size={16} />
                                전체선택 {meta.total > 0 ? `(${meta.total})` : ''}
                            </button>
                            <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50" disabled={selectedIds.length === 0}>
                                <X size={16} />
                                선택해제
                            </button>
                            <button onClick={handleBatchSelect} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50" disabled={selectedIds.length === 0 || batchSelectItems.isPending}>
                                <CheckSquare size={16} />
                                선택업체 저장 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                            </button>
                            <button onClick={() => navigate('/sales-leads')} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">
                                영업관리로 이동
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1560px] text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/70 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-3 py-3 w-10">
                                        <button onClick={togglePageSelection} className="text-slate-400 hover:text-blue-600" title={allPageSelected ? '현재 페이지 선택해제' : '현재 페이지 전체선택'}>
                                            {allPageSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </button>
                                    </th>
                                    <th className="px-3 py-3">현황</th>
                                    <th className="px-3 py-3">분류</th>
                                    <th className="px-3 py-3">상호</th>
                                    <th className="px-3 py-3">지역</th>
                                    <th className="px-3 py-3">상태</th>
                                    <th className="px-3 py-3">연락처</th>
                                    <th className="px-3 py-3">진료/의료진</th>
                                    <th className="px-3 py-3">분만후보</th>
                                    <th className="px-3 py-3">객실/서비스</th>
                                    <th className="px-3 py-3">규모</th>
                                    <th className="px-3 py-3">점수</th>
                                    <th className="px-3 py-3 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="px-3 py-4">
                                            <button onClick={() => toggleSelectedId(item.id)} className="text-slate-400 hover:text-blue-600" title="일괄 영업선택">
                                                {selectedIds.includes(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-4"><StatusBadges item={item} /></td>
                                        <td className="px-3 py-4 font-bold text-slate-700 dark:text-slate-200">{businessLabel(item.businessType)}</td>
                                        <td className="px-3 py-4">
                                            <div className="font-black text-slate-900 dark:text-white">{item.name}</div>
                                            <div className="text-xs text-slate-400 truncate max-w-[220px]">{item.address || '-'}</div>
                                        </td>
                                        <td className="px-3 py-4">{[item.region, item.district].filter(Boolean).join(' ')}</td>
                                        <td className="px-3 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.operationStatus === 'closed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                                                {operationLabel(item.operationStatus)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div>{item.phone || '-'}</div>
                                            <div>{item.email || '-'}</div>
                                            {item.website && <a href={item.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">홈페이지</a>}
                                            {item.blog && <a href={item.blog} target="_blank" rel="noreferrer" className="ml-2 text-blue-600 hover:underline">블로그</a>}
                                            {item.instagram && <a href={item.instagram} target="_blank" rel="noreferrer" className="ml-2 text-blue-600 hover:underline">인스타그램</a>}
                                            <div>
                                                {getNaverPlaceUrl(item)
                                                    ? <a href={getNaverPlaceUrl(item)!} target="_blank" rel="noreferrer" className="text-green-700 hover:underline dark:text-green-300">네이버플레이스</a>
                                                    : <span className="text-slate-400">플레이스 없음</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div className="max-w-[220px] truncate">{item.medicalDepartments?.join(', ') || '-'}</div>
                                            <div className="text-slate-500 dark:text-slate-300">산부인과 {getDoctorCount(item, '산부인과') ?? '-'}명</div>
                                            <div className="text-slate-400">소청과 {getDoctorCount(item, '소아청소년과') ?? '-'}명 · 전체 {item.totalDoctorCount || '-'}명</div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div className={isDeliveryCandidateItem(item) ? 'font-black text-violet-700 dark:text-violet-200' : 'font-bold text-slate-500 dark:text-slate-300'}>
                                                {isDeliveryCandidateItem(item) ? '분만병원 후보' : deliveryGradeLabel(getDeliveryCandidate(item).grade)}
                                            </div>
                                            <div className="text-slate-400">
                                                점수 {getDeliveryCandidate(item).score ?? '-'} / 4 · 인큐 {getDeliveryCandidate(item).incubatorCount ?? '-'} · 감시기 {getDeliveryCandidate(item).deliveryMonitorCount ?? '-'}
                                            </div>
                                            <div className="max-w-[220px] truncate text-slate-400">
                                                {item.rawData?.naverLocal?.category || (item.rawData?.nameKeywordMatched ? '기관명 예외' : '카테고리 미확인')}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div>객실 {item.roomCount || '-'}개</div>
                                            <div className="max-w-[180px] truncate text-slate-400">{item.additionalServices?.join(', ') || item.aestheticBrand || '-'}</div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div className="max-w-[180px] truncate">{item.buildingScale || '-'}</div>
                                            <div className="text-slate-400">{item.occupiedFloors || ''}</div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 rounded-lg text-xs font-black">
                                                <Star size={12} />
                                                {item.priorityGrade} · {item.marketScore}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => item.isSelected ? unselectItem.mutate(item.id) : selectItem.mutate(item.id)}
                                                    className={`p-2 rounded-lg ${item.isSelected ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'}`}
                                                    title={item.isSelected ? '영업선택 해제' : '영업선택 저장'}
                                                >
                                                    {item.isSelected ? <X size={15} /> : <Save size={15} />}
                                                </button>
                                                <button
                                                    onClick={() => { setEditingItem(item); setEditForm(item); }}
                                                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    title="조사내역 편집"
                                                >
                                                    <Edit3 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!isLoading && items.length === 0 && (
                                    <tr>
                                        <td colSpan={13} className="px-4 py-16 text-center text-slate-400">
                                            <Activity size={32} className="mx-auto mb-3 opacity-40" />
                                            조건에 맞는 시장조사 결과가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
                        <div>
                            기본 화면은 트래픽과 렌더링 부하를 줄이기 위해 검증 산부인과 후보만 표시합니다. 전체 5천건 원본은 `전체 원본`에서 확인할 수 있습니다.
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                disabled={meta.page <= 1 || isLoading}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700"
                            >
                                이전
                            </button>
                            <span className="min-w-24 text-center font-bold">
                                {meta.page} / {meta.totalPages}
                            </span>
                            <button
                                onClick={() => setPage(prev => Math.min(meta.totalPages, prev + 1))}
                                disabled={meta.page >= meta.totalPages || isLoading}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700"
                            >
                                다음
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {editingItem && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingItem(null)}>
                    <div className="w-full max-w-2xl bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">조사내역 편집</p>
                                <h2 className="text-xl font-black">{editingItem.name}</h2>
                            </div>
                            <button onClick={() => setEditingItem(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">분류</span>
                                <select
                                    value={editForm.businessType || 'general_obgyn'}
                                    onChange={e => {
                                        const businessType = e.target.value as MarketResearchItem['businessType'];
                                        const isDeliveryHospital = businessType === 'delivery_hospital';
                                        setEditForm(prev => ({
                                            ...prev,
                                            businessType,
                                            isDeliveryHospital,
                                            rawData: {
                                                ...(prev.rawData || {}),
                                                manualBusinessType: true,
                                                manualDeliveryCandidate: isDeliveryHospital,
                                            },
                                        }));
                                    }}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                >
                                    {BUSINESS_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">운영상태</span>
                                <select
                                    value={editForm.operationStatus || 'unknown'}
                                    onChange={e => setEditForm(prev => ({ ...prev, operationStatus: e.target.value as MarketResearchItem['operationStatus'] }))}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                >
                                    {OPERATION_STATUSES.filter(status => status.value !== 'all').map(status => (
                                        <option key={status.value} value={status.value}>{status.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">우선등급</span>
                                <select
                                    value={editForm.priorityGrade || 'C'}
                                    onChange={e => setEditForm(prev => ({ ...prev, priorityGrade: e.target.value }))}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                >
                                    {['A', 'B', 'C', 'D'].map(grade => (
                                        <option key={grade} value={grade}>{grade}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">시장점수</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={editForm.marketScore ?? ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, marketScore: Number(e.target.value || 0) }))}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                            </label>
                            {[
                                ['name', '상호'],
                                ['phone', '전화번호'],
                                ['email', '이메일'],
                                ['website', '홈페이지'],
                                ['instagram', '인스타그램'],
                                ['blog', '블로그'],
                                ['address', '주소'],
                                ['deliveryCount', '최근 분만수'],
                                ['totalDoctorCount', '전체 의료진 수'],
                                ['roomCount', '객실 수'],
                                ['aestheticBrand', '에스테틱 브랜드'],
                                ['buildingScale', '건물 규모'],
                                ['occupiedFloors', '사용층'],
                            ].map(([key, label]) => (
                                <label key={key} className="flex flex-col gap-1.5">
                                    <span className="text-xs font-bold text-slate-400">{label}</span>
                                    <input
                                        value={(editForm as any)[key] ?? ''}
                                        onChange={e => setEditForm(prev => ({ ...prev, [key]: ['deliveryCount', 'totalDoctorCount', 'roomCount'].includes(key) ? Number(e.target.value || 0) : e.target.value }))}
                                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                </label>
                            ))}
                            <label className="md:col-span-2 flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">네이버 플레이스 URL</span>
                                <input
                                    value={getNaverPlaceUrl(editForm as MarketResearchItem) || ''}
                                    onChange={e => setEditForm(prev => ({
                                        ...prev,
                                        rawData: {
                                            ...(prev.rawData || {}),
                                            manualNaverPlaceUrl: e.target.value || null,
                                        },
                                    }))}
                                    placeholder="없으면 비워둡니다. 관리자가 확인 후 직접 입력할 수 있습니다."
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                            </label>
                            <label className="md:col-span-2 flex flex-col gap-1.5">
                                <span className="text-xs font-bold text-slate-400">메모</span>
                                <textarea value={editForm.memo || ''} onChange={e => setEditForm(prev => ({ ...prev, memo: e.target.value }))} className="min-h-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </label>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                            <button onClick={() => setEditingItem(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">취소</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketResearchPage;

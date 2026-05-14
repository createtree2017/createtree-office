import { useMemo, useState } from 'react';
import { Activity, CheckSquare, Database, Download, Edit3, Filter, Play, RefreshCw, Save, Search, Square, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    downloadMarketResearchExcel,
    MarketResearchItem,
    useCreateMarketResearchRun,
    useMarketResearchItems,
    useMarketResearchRuns,
    useSelectMarketResearchItem,
    useUnselectMarketResearchItem,
    useUpdateMarketResearchItem,
} from '../hooks/useMarketResearch';

const BUSINESS_TYPES = [
    { value: 'all', label: '전체' },
    { value: 'obgyn', label: '산부인과+여성병원' },
    { value: 'delivery_hospital', label: '분만병원' },
    { value: 'general_obgyn', label: '일반 산부인과' },
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
    const [filters, setFilters] = useState({ q: '', businessType: 'all', region: '전국', operationStatus: 'all', flag: 'all' });
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [editingItem, setEditingItem] = useState<MarketResearchItem | null>(null);
    const [editForm, setEditForm] = useState<Partial<MarketResearchItem>>({});

    const { data: runs = [], isLoading: runsLoading } = useMarketResearchRuns();
    const { data: items = [], isLoading } = useMarketResearchItems(filters);
    const createRun = useCreateMarketResearchRun();
    const selectItem = useSelectMarketResearchItem();
    const unselectItem = useUnselectMarketResearchItem();
    const updateItem = useUpdateMarketResearchItem();

    const latestRun = runs[0];
    const summary = useMemo(() => ({
        total: items.length,
        selected: items.filter(item => item.isSelected).length,
        newItems: items.filter(item => item.isNew).length,
        updated: items.filter(item => item.hasUpdates).length,
        closed: items.filter(item => item.operationStatus === 'closed').length,
    }), [items]);

    const toggleSelectedId = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
    };

    const handleRunResearch = async () => {
        try {
            await createRun.mutateAsync({
                title: `시장조사 ${new Date().toLocaleDateString('ko-KR')}`,
                regionScope: filters.region,
                regions: filters.region === '전국' ? [] : [filters.region],
                businessTypes: filters.businessType === 'all' ? ['obgyn', 'postpartum_center'] : [filters.businessType],
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
            for (const id of selectedIds) {
                await selectItem.mutateAsync(id);
            }
            setSelectedIds([]);
            toast.success('영업선택업체로 저장했습니다.');
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
                        <button onClick={handleBatchSelect} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50" disabled={selectedIds.length === 0 || selectItem.isPending}>
                            <CheckSquare size={16} />
                            선택업체 저장 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                        </button>
                        <button onClick={() => downloadMarketResearchExcel(filters).catch((err) => toast.error(err.message))} className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200">
                            <Download size={16} />
                            엑셀 다운로드
                        </button>
                        <button onClick={handleRunResearch} disabled={createRun.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                            {createRun.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                            시장조사 실행
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        ['전체', summary.total, 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'],
                        ['영업선택', summary.selected, 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'],
                        ['신규업체', summary.newItems, 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'],
                        ['업데이트', summary.updated, 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'],
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
                    <div className="flex flex-wrap gap-2">
                        {BUSINESS_TYPES.map(item => <FilterButton key={item.value} active={filters.businessType === item.value} label={item.label} onClick={() => setFilters(prev => ({ ...prev, businessType: item.value }))} />)}
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
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
                            {isLoading ? '불러오는 중...' : `${items.length}개 업체`}
                        </div>
                        <div className="text-xs text-slate-400">
                            최근 실행: {runsLoading ? '확인 중' : latestRun ? `${latestRun.title} · ${latestRun.status}` : '없음'}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1500px] text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/70 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-3 py-3 w-10">선택</th>
                                    <th className="px-3 py-3">현황</th>
                                    <th className="px-3 py-3">분류</th>
                                    <th className="px-3 py-3">상호</th>
                                    <th className="px-3 py-3">지역</th>
                                    <th className="px-3 py-3">상태</th>
                                    <th className="px-3 py-3">연락처</th>
                                    <th className="px-3 py-3">진료/의료진</th>
                                    <th className="px-3 py-3">분만</th>
                                    <th className="px-3 py-3">객실/서비스</th>
                                    <th className="px-3 py-3">규모</th>
                                    <th className="px-3 py-3">점수</th>
                                    <th className="px-3 py-3">검증</th>
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
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div className="max-w-[220px] truncate">{item.medicalDepartments?.join(', ') || '-'}</div>
                                            <div className="text-slate-400">의료진 {item.totalDoctorCount || '-'}명</div>
                                        </td>
                                        <td className="px-3 py-4 text-xs">
                                            <div>{item.isDeliveryHospital ? '분만병원' : '-'}</div>
                                            <div className="text-slate-400">{item.deliveryCount ? `${item.deliveryCountYear || ''}년 ${item.deliveryCount}분만` : '분만수 확인필요'}</div>
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
                                        <td className="px-3 py-4 text-xs">
                                            <div>{item.verificationStatus}</div>
                                            <div className="text-slate-400">{item.sourceConfidence}</div>
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
                                        <td colSpan={14} className="px-4 py-16 text-center text-slate-400">
                                            <Activity size={32} className="mx-auto mb-3 opacity-40" />
                                            조건에 맞는 시장조사 결과가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
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
                            {[
                                ['name', '상호'],
                                ['phone', '전화번호'],
                                ['email', '이메일'],
                                ['website', '홈페이지'],
                                ['instagram', '인스타그램'],
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

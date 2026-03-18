import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
    Package, Plus, Save, ArrowLeft, Trash2, MoveUp, MoveDown,
    GripVertical, ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Settings2
} from 'lucide-react';
import SubNav from '../components/SubNav';

// ===== 타입 정의 =====
type BillingType = 'monthly' | 'per_event' | 'one_time' | 'quote_based';
type PriceUnit = 'per_month' | 'per_event' | 'per_person' | 'per_item' | 'one_time';
type ItemCategory = 'fixed' | 'variable';

interface ServiceItemPrice { id?: number; itemId?: number; tierId: number | null; tierSortOrder?: number; price: number; }
interface ServiceItem { id?: number; tempId?: string; serviceId?: number; name: string; description?: string; category: ItemCategory; isRequired: boolean; priceUnit: PriceUnit; unitLabel?: string; sortOrder: number; prices: ServiceItemPrice[]; }
interface ServiceTier { id?: number; tempId?: string; serviceId?: number; name: string; description?: string; minQuantity?: number; maxQuantity?: number; sortOrder: number; isDefault: boolean; }
interface Service { id: number; name: string; slug: string; description?: string; billingType: BillingType; isActive: boolean; sortOrder: number; metadata?: any; linkedTaskTemplateId?: number; createdAt: string; updatedAt: string; tiers: ServiceTier[]; items: ServiceItem[]; }
interface DiscountPolicy { id?: number; name: string; minMonths: number; discountRate: number; isActive: boolean; }

const API = '/api/services';
const getHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const BILLING_LABELS: Record<BillingType, string> = { monthly: '월정액', per_event: '건당', one_time: '일회성', quote_based: '견적기반' };
const BILLING_COLORS: Record<BillingType, string> = { monthly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', per_event: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', one_time: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', quote_based: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
const PRICE_UNIT_LABELS: Record<PriceUnit, string> = { per_month: '월', per_event: '회', per_person: '인', per_item: '건', one_time: '일회' };
const CATEGORY_LABELS: Record<ItemCategory, string> = { fixed: '고정비(필수)', variable: '변동비(선택)' };

const uid = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const ServiceProductsPage: React.FC = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showPolicies, setShowPolicies] = useState(false);

    // 편집 상태
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState({ name: '', slug: '', description: '', billingType: 'monthly' as BillingType, isActive: true, sortOrder: 0, metadata: null as any });
    const [tiers, setTiers] = useState<ServiceTier[]>([]);
    const [items, setItems] = useState<ServiceItem[]>([]);

    // 할인 정책
    const [policies, setPolicies] = useState<DiscountPolicy[]>([]);

    // ===== 데이터 로드 =====
    const fetchServices = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(API, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) setServices(data.data);
        } catch { toast.error('서비스 목록 로드 실패'); }
        setLoading(false);
    }, []);

    const fetchPolicies = useCallback(async () => {
        try {
            const res = await fetch(`${API}/discount-policies`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) setPolicies(data.data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchServices(); fetchPolicies(); }, [fetchServices, fetchPolicies]);

    // ===== 편집 로직 =====
    const handleNew = () => {
        setEditId(null);
        setForm({ name: '', slug: '', description: '', billingType: 'monthly', isActive: true, sortOrder: services.length, metadata: null });
        setTiers([]);
        setItems([]);
        setIsEditing(true);
    };

    const handleEdit = (svc: Service) => {
        setEditId(svc.id);
        setForm({ name: svc.name, slug: svc.slug, description: svc.description || '', billingType: svc.billingType, isActive: svc.isActive, sortOrder: svc.sortOrder, metadata: svc.metadata });
        setTiers(svc.tiers.map(t => ({ ...t, tempId: uid() })));
        setItems(svc.items.map(it => ({ ...it, tempId: uid(), prices: it.prices || [] })));
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return toast.error('서비스 이름을 입력해주세요.');
        if (!form.slug.trim()) return toast.error('slug를 입력해주세요.');

        const payload = {
            ...form,
            tiers: tiers.map((t, i) => ({ ...t, sortOrder: i, tempId: t.tempId })),
            items: items.map((it, i) => ({
                ...it,
                sortOrder: i,
                prices: it.prices.map(p => ({
                    ...p,
                    tierSortOrder: p.tierId !== null ? tiers.findIndex(t => (t.id && t.id === p.tierId) || (t.tempId && t.tempId === String(p.tierId))) : undefined,
                })),
            })),
        };

        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `${API}/${editId}` : API;
            const res = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(payload) });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message || '저장되었습니다.');
                setIsEditing(false);
                fetchServices();
            } else {
                toast.error(data.message || '저장 실패');
            }
        } catch { toast.error('저장 중 오류 발생'); }
    };

    const handleDelete = async (svc: Service) => {
        if (!confirm(`"${svc.name}" 서비스를 삭제하시겠습니까?\n\n⚠️ 하위 등급, 비용 항목이 모두 삭제됩니다.`)) return;
        try {
            const res = await fetch(`${API}/${svc.id}`, { method: 'DELETE', headers: getHeaders() });
            const data = await res.json();
            if (data.success) { toast.success(data.message); fetchServices(); }
        } catch { toast.error('삭제 실패'); }
    };

    // ===== Tier 관리 =====
    const addTier = () => setTiers([...tiers, { tempId: uid(), name: '', description: '', sortOrder: tiers.length, isDefault: false }]);
    const removeTier = (idx: number) => {
        const removed = tiers[idx];
        const removedId = removed.id || removed.tempId;
        setTiers(tiers.filter((_, i) => i !== idx));
        // 관련 가격도 제거
        setItems(items.map(it => ({ ...it, prices: it.prices.filter(p => p.tierId !== removedId && p.tierId !== removed.id) })));
    };
    const updateTier = (idx: number, field: string, val: any) => setTiers(tiers.map((t, i) => i === idx ? { ...t, [field]: val } : t));

    // ===== Item 관리 =====
    const addItem = () => setItems([...items, { tempId: uid(), name: '', category: 'fixed', isRequired: true, priceUnit: 'per_month', unitLabel: '월', sortOrder: items.length, prices: [] }]);
    const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
    const updateItem = (idx: number, field: string, val: any) => setItems(items.map((it, i) => i === idx ? { ...it, [field]: val } : it));

    // ===== 가격 매트릭스 =====
    const getPrice = (item: ServiceItem, tierId: number | string | null): number => {
        const found = item.prices.find(p => {
            if (tierId === null) return p.tierId === null;
            return p.tierId === tierId;
        });
        return found?.price ?? 0;
    };

    const setPrice = (itemIdx: number, tierId: number | string | null, price: number) => {
        setItems(items.map((it, i) => {
            if (i !== itemIdx) return it;
            const existing = it.prices.findIndex(p => {
                if (tierId === null) return p.tierId === null;
                return p.tierId === tierId;
            });
            const newPrices = [...it.prices];
            if (existing >= 0) {
                newPrices[existing] = { ...newPrices[existing], price };
            } else {
                newPrices.push({ tierId: tierId as number | null, price });
            }
            return { ...it, prices: newPrices };
        }));
    };

    // ===== 할인 정책 저장 =====
    const savePolicies = async () => {
        try {
            const res = await fetch(`${API}/discount-policies`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ policies }) });
            const data = await res.json();
            if (data.success) { toast.success('할인 정책이 저장되었습니다.'); setPolicies(data.data); }
        } catch { toast.error('할인 정책 저장 실패'); }
    };

    // auto-slug
    const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
        return <div className="p-8 text-center text-red-500">접근 권한이 없습니다.</div>;
    }

    // ========== 편집 모드 ==========
    if (isEditing) {
        return (
            <div className="max-w-5xl mx-auto p-6 pt-20 space-y-6 pb-32">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-[hsl(var(--accent))] rounded-lg"><ArrowLeft size={20} /></button>
                        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{editId ? '서비스 수정' : '새 서비스 등록'}</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* 활성/비활성 토글 스위치 */}
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${form.isActive ? 'text-emerald-600' : 'text-[hsl(var(--muted-foreground))]'}`}>
                                {form.isActive ? '활성' : '비활성'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setForm({ ...form, isActive: !form.isActive })}
                                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    form.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                        form.isActive ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                        <button onClick={handleSave} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2 shadow-md">
                            <Save size={16} /> 저장
                        </button>
                    </div>
                </div>

                {/* 기본 정보 */}
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-bold text-[hsl(var(--foreground))] flex items-center gap-2"><Package size={18} /> 기본 정보</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">서비스 이름 *</label>
                            <input value={form.name} onChange={e => { setForm({ ...form, name: e.target.value, slug: editId ? form.slug : autoSlug(e.target.value) }); }} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))]" placeholder="예: 행사" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">Slug (영문 식별자) *</label>
                            <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))] font-mono text-sm" placeholder="예: event" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">설명</label>
                        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))] resize-none" rows={2} placeholder="서비스에 대한 설명" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">과금 유형 *</label>
                        <select value={form.billingType} onChange={e => setForm({ ...form, billingType: e.target.value as BillingType })} className="w-full p-2.5 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
                            <option value="monthly">월정액</option>
                            <option value="per_event">건당</option>
                            <option value="one_time">일회성</option>
                            <option value="quote_based">견적기반 (문의/컨설팅)</option>
                        </select>
                    </div>
                </div>

                {/* 등급/구간 관리 */}
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">📊 등급/구간</h2>
                        <button onClick={addTier} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                            <Plus size={14} /> 등급 추가
                        </button>
                    </div>
                    {tiers.length === 0 ? (
                        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">등급이 없습니다. 단일 가격 서비스이면 등급 없이 진행 가능합니다.</p>
                    ) : (
                        <div className="space-y-3">
                            {tiers.map((t, idx) => (
                                <div key={t.tempId || t.id} className="flex items-start gap-3 p-3 bg-[hsl(var(--accent))] rounded-lg">
                                    <span className="text-xs font-mono text-[hsl(var(--muted-foreground))] mt-3 w-6 text-center">{idx + 1}</span>
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <input value={t.name} onChange={e => updateTier(idx, 'name', e.target.value)} className="p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm" placeholder="등급명 (예: 10~20명)" />
                                        <input value={t.description || ''} onChange={e => updateTier(idx, 'description', e.target.value)} className="p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm" placeholder="설명 (예: 부부5~10팀)" />
                                        <div className="flex gap-2">
                                            <input type="number" value={t.minQuantity || ''} onChange={e => updateTier(idx, 'minQuantity', e.target.value ? parseInt(e.target.value) : null)} className="w-20 p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm" placeholder="최소" />
                                            <span className="self-center text-[hsl(var(--muted-foreground))]">~</span>
                                            <input type="number" value={t.maxQuantity || ''} onChange={e => updateTier(idx, 'maxQuantity', e.target.value ? parseInt(e.target.value) : null)} className="w-20 p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm" placeholder="최대" />
                                        </div>
                                    </div>
                                    <button onClick={() => removeTier(idx)} className="p-1.5 text-red-400 hover:text-red-600 mt-1"><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 비용 항목 관리 */}
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">💰 비용 항목</h2>
                        <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                            <Plus size={14} /> 항목 추가
                        </button>
                    </div>
                    {items.length === 0 ? (
                        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">비용 항목이 없습니다. 견적기반 서비스는 항목 없이 진행 가능합니다.</p>
                    ) : (
                        <div className="space-y-3">
                            {items.map((it, idx) => (
                                <div key={it.tempId || it.id} className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
                                    <div className="flex items-start gap-3 p-4 bg-[hsl(var(--accent))]">
                                        <span className="text-xs font-mono text-[hsl(var(--muted-foreground))] mt-2 w-6 text-center">{idx + 1}</span>
                                        <div className="flex-1 space-y-2">
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                                <input value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} className="p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm md:col-span-2" placeholder="항목명 (예: 운영비)" />
                                                <select value={it.category} onChange={e => updateItem(idx, 'category', e.target.value)} className="p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm">
                                                    <option value="fixed">고정비(필수)</option>
                                                    <option value="variable">변동비(선택)</option>
                                                </select>
                                                <select value={it.priceUnit} onChange={e => updateItem(idx, 'priceUnit', e.target.value)} className="p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm">
                                                    <option value="per_month">월 단위</option>
                                                    <option value="per_event">회 단위</option>
                                                    <option value="per_person">인당</option>
                                                    <option value="per_item">건당</option>
                                                    <option value="one_time">일회성</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <input value={it.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} className="flex-1 p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm" placeholder="설명 (선택)" />
                                                <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                                                    <input type="checkbox" checked={it.isRequired} onChange={e => updateItem(idx, 'isRequired', e.target.checked)} className="rounded" />
                                                    필수
                                                </label>
                                            </div>
                                        </div>
                                        <button onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 mt-1"><Trash2 size={16} /></button>
                                    </div>
                                    {/* 가격 입력 */}
                                    <div className="p-3 bg-[hsl(var(--background))] border-t border-[hsl(var(--border))]">
                                        {tiers.length === 0 ? (
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-[hsl(var(--muted-foreground))] w-20">단가:</span>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" value={getPrice(it, null) || ''} onChange={e => setPrice(idx, null, parseInt(e.target.value) || 0)} className="w-24 p-1.5 border border-[hsl(var(--border))] rounded bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm text-right" placeholder="0" />
                                                    <span className="text-xs text-[hsl(var(--muted-foreground))]">만원/{PRICE_UNIT_LABELS[it.priceUnit]}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-3">
                                                {tiers.map((t) => {
                                                    const tierId = t.id || t.tempId;
                                                    return (
                                                        <div key={tierId} className="flex items-center gap-2">
                                                            <span className="text-xs text-[hsl(var(--muted-foreground))] min-w-[60px]">{t.name}:</span>
                                                            <div className="flex items-center gap-1">
                                                                <input type="number" value={getPrice(it, tierId as any) || ''} onChange={e => setPrice(idx, tierId as any, parseInt(e.target.value) || 0)} className="w-20 p-1.5 border border-[hsl(var(--border))] rounded bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm text-right" placeholder="0" />
                                                                <span className="text-xs text-[hsl(var(--muted-foreground))]">만원</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {/* 공통 단가 */}
                                                <div className="flex items-center gap-2 border-l border-[hsl(var(--border))] pl-3">
                                                    <span className="text-xs text-[hsl(var(--muted-foreground))] min-w-[60px]">공통단가:</span>
                                                    <div className="flex items-center gap-1">
                                                        <input type="number" value={getPrice(it, null) || ''} onChange={e => setPrice(idx, null, parseInt(e.target.value) || 0)} className="w-20 p-1.5 border border-[hsl(var(--border))] rounded bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm text-right" placeholder="0" />
                                                        <span className="text-xs text-[hsl(var(--muted-foreground))]">만원/{PRICE_UNIT_LABELS[it.priceUnit]}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ========== 목록 모드 ==========
    return (
        <div className="pt-14 min-h-screen bg-[hsl(var(--background))]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <SubNav
                    group="product"
                    rightSlot={
                        <div className="flex gap-2">
                            <button onClick={() => setShowPolicies(!showPolicies)} className="flex items-center gap-1.5 px-3 py-2 border border-[hsl(var(--border))] rounded-lg text-sm font-semibold hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]">
                                <Settings2 size={14} /> 할인 정책
                            </button>
                            {user?.role === 'ADMIN' && (
                                <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold shadow-md">
                                    <Plus size={16} /> 서비스 등록
                                </button>
                            )}
                        </div>
                    }
                />

                {/* 할인 정책 패널 */}
                {showPolicies && (
                    <div className="mb-6 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4">
                        <h3 className="font-bold text-[hsl(var(--foreground))] flex items-center gap-2"><Settings2 size={16} /> 계약 기간별 할인 정책</h3>
                        <div className="space-y-2">
                            {policies.map((p, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <input value={p.name} onChange={e => setPolicies(policies.map((pp, i) => i === idx ? { ...pp, name: e.target.value } : pp))} className="p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm" placeholder="정책명" />
                                    <div className="flex items-center gap-1">
                                        <input type="number" value={p.minMonths} onChange={e => setPolicies(policies.map((pp, i) => i === idx ? { ...pp, minMonths: parseInt(e.target.value) || 0 } : pp))} className="w-16 p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm text-right" />
                                        <span className="text-xs text-[hsl(var(--muted-foreground))]">개월 이상</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input type="number" value={p.discountRate} onChange={e => setPolicies(policies.map((pp, i) => i === idx ? { ...pp, discountRate: parseInt(e.target.value) || 0 } : pp))} className="w-16 p-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm text-right" />
                                        <span className="text-xs text-[hsl(var(--muted-foreground))]">% 할인</span>
                                    </div>
                                    <label className="flex items-center gap-1"><input type="checkbox" checked={p.isActive} onChange={e => setPolicies(policies.map((pp, i) => i === idx ? { ...pp, isActive: e.target.checked } : pp))} className="rounded" /><span className="text-xs">활성</span></label>
                                    <button onClick={() => setPolicies(policies.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setPolicies([...policies, { name: '', minMonths: 6, discountRate: 5, isActive: true }])} className="text-sm text-blue-600 hover:underline">+ 정책 추가</button>
                            <button onClick={savePolicies} className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">저장</button>
                        </div>
                    </div>
                )}

                {/* 서비스 카드 그리드 */}
                {loading ? (
                    <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">불러오는 중...</div>
                ) : services.length === 0 ? (
                    <div className="text-center py-20 bg-[hsl(var(--card))] border border-dashed border-[hsl(var(--border))] rounded-xl">
                        <Package size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                        <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">등록된 서비스가 없습니다.</h3>
                        <p className="text-[hsl(var(--muted-foreground))] mt-2">첫 번째 서비스 상품을 등록해보세요!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {services.map(svc => (
                            <div key={svc.id} className={`bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden hover:shadow-lg transition flex flex-col group ${!svc.isActive ? 'opacity-50' : ''}`}>
                                <div className="p-5 flex-1 cursor-pointer" onClick={() => handleEdit(svc)}>
                                    <div className="flex items-start justify-between mb-3">
                                        <h3 className="text-lg font-bold text-[hsl(var(--foreground))] group-hover:text-emerald-600 transition">{svc.name}</h3>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BILLING_COLORS[svc.billingType]}`}>
                                            {BILLING_LABELS[svc.billingType]}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[hsl(var(--muted-foreground))] line-clamp-2 mb-3">{svc.description || '설명 없음'}</p>
                                    {/* 등급 태그 */}
                                    {svc.tiers.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {svc.tiers.map(t => (
                                                <span key={t.id} className="px-2 py-0.5 bg-[hsl(var(--accent))] rounded text-xs text-[hsl(var(--muted-foreground))]">{t.name}</span>
                                            ))}
                                        </div>
                                    )}
                                    {/* 비용 항목 요약 */}
                                    {svc.items.length > 0 && (
                                        <div className="space-y-1">
                                            {svc.items.slice(0, 3).map(it => (
                                                <div key={it.id} className="flex justify-between text-xs">
                                                    <span className="text-[hsl(var(--muted-foreground))]">
                                                        {it.isRequired ? '✅' : '☑️'} {it.name}
                                                    </span>
                                                    <span className="text-[hsl(var(--foreground))] font-medium">
                                                        {it.prices.length > 0 ? `${Math.min(...it.prices.map(p => p.price))}~${Math.max(...it.prices.map(p => p.price))}만원` : '-'}
                                                        <span className="text-[hsl(var(--muted-foreground))] ml-0.5">/{PRICE_UNIT_LABELS[it.priceUnit]}</span>
                                                    </span>
                                                </div>
                                            ))}
                                            {svc.items.length > 3 && <p className="text-xs text-[hsl(var(--muted-foreground))]">... 외 {svc.items.length - 3}개 항목</p>}
                                        </div>
                                    )}
                                </div>
                                <div className="bg-[hsl(var(--accent))] p-3 border-t border-[hsl(var(--border))] flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
                                    <div className="flex items-center gap-2">
                                        <span>{svc.isActive ? '🟢 활성' : '🔴 비활성'}</span>
                                        <span>·</span>
                                        <span>{svc.tiers.length}개 등급</span>
                                        <span>·</span>
                                        <span>{svc.items.length}개 항목</span>
                                    </div>
                                    {user?.role === 'ADMIN' && (
                                        <div className="flex gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); handleEdit(svc); }} className="p-1 hover:text-blue-600"><Pencil size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(svc); }} className="p-1 hover:text-red-500"><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServiceProductsPage;

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getAuthHeaders, type ApiResponse } from '../lib/api';

export interface MarketResearchFilters {
  q?: string;
  businessType?: string;
  region?: string;
  operationStatus?: string;
  buildingScale?: string;
  flag?: string;
  view?: string;
  page?: number;
  pageSize?: number;
}

export interface MarketResearchItem {
  id: number;
  businessType: string;
  name: string;
  region: string;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  operationStatus: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  blog?: string | null;
  isNew: boolean;
  hasUpdates: boolean;
  isSelected: boolean;
  isDeliveryHospital: boolean;
  deliveryCountYear?: number | null;
  deliveryCount?: number | null;
  medicalDepartments?: string[];
  doctorCounts?: Record<string, number>;
  totalDoctorCount?: number | null;
  hasDeliveryCenter?: boolean;
  hasFertilityCenter?: boolean;
  hasPediatricLink?: boolean;
  roomCount?: number | null;
  roomGrades?: Array<{ grade: string; count?: number; price?: string }>;
  aestheticBrand?: string | null;
  additionalServices?: string[];
  buildingScale?: string | null;
  occupiedFloors?: string | null;
  marketScore: number;
  priorityGrade: string;
  sourceConfidence: string;
  verificationStatus: string;
  rawData?: Record<string, any>;
  memo?: string | null;
  lastResearchedAt: string;
  salesLeadId?: number | null;
  salesStatus?: string | null;
}

export interface MarketResearchRun {
  id: number;
  title: string;
  regionScope: string;
  regions: string[];
  businessTypes: string[];
  operationStatuses: string[];
  sources: string[];
  status: string;
  stats?: Record<string, any>;
  errorLog?: any[];
  createdAt: string;
}

export interface MarketResearchSummary {
  total: number;
  selected: number;
  newItems: number;
  updated: number;
  deliveryCandidates: number;
  closed: number;
  verifiedObgyn: number;
  detailCandidates: number;
}

export interface MarketResearchItemsResult {
  items: MarketResearchItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

type PaginatedApiResponse<T> = ApiResponse<T> & {
  meta?: MarketResearchItemsResult['meta'];
};

function toQuery(filters: MarketResearchFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && (value !== 'all' || key === 'view')) {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useMarketResearchRuns() {
  return useQuery({
    queryKey: ['market-research-runs'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<MarketResearchRun[]>>('/api/market-research/runs');
      if (!data.success) throw new Error('Failed to fetch research runs');
      return data.data;
    },
    refetchInterval: 5 * 1000,
    staleTime: 0,
  });
}

export function useMarketResearchItems(filters: MarketResearchFilters, poll = false) {
  return useQuery({
    queryKey: ['market-research-items', filters],
    queryFn: async () => {
      const data = await apiFetch<PaginatedApiResponse<MarketResearchItem[]>>(`/api/market-research/items${toQuery(filters)}`);
      if (!data.success) throw new Error('Failed to fetch research items');
      return {
        items: data.data,
        meta: data.meta || {
          total: data.data.length,
          page: filters.page || 1,
          pageSize: filters.pageSize || data.data.length,
          totalPages: 1,
        },
      };
    },
    refetchInterval: poll ? 5 * 1000 : false,
    staleTime: 30 * 1000,
  });
}

export function useMarketResearchSummary(filters: MarketResearchFilters, poll = false) {
  const { page: _page, pageSize: _pageSize, ...summaryFilters } = filters;
  return useQuery({
    queryKey: ['market-research-summary', summaryFilters],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<MarketResearchSummary>>(`/api/market-research/summary${toQuery(summaryFilters)}`);
      if (!data.success) throw new Error('Failed to fetch research summary');
      return data.data;
    },
    refetchInterval: poll ? 5 * 1000 : false,
    staleTime: 30 * 1000,
  });
}

export function useCreateMarketResearchRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title?: string; regionScope?: string; regions: string[]; businessTypes: string[]; operationStatuses: string[] }) => {
      const data = await apiFetch<ApiResponse<MarketResearchRun>>('/api/market-research/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!data.success) throw new Error(data.message || '시장조사 실행 실패');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-research-runs'] });
      queryClient.invalidateQueries({ queryKey: ['market-research-items'] });
      queryClient.invalidateQueries({ queryKey: ['market-research-summary'] });
    },
  });
}

export function useUpdateMarketResearchItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<MarketResearchItem> }) => {
      const data = await apiFetch<ApiResponse<MarketResearchItem>>(`/api/market-research/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!data.success) throw new Error(data.message || '시장조사 항목 수정 실패');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-research-items'] });
      queryClient.invalidateQueries({ queryKey: ['market-research-summary'] });
    },
  });
}

export async function fetchMarketResearchItemIds(filters: MarketResearchFilters) {
  const data = await apiFetch<ApiResponse<number[]>>(`/api/market-research/items/ids${toQuery(filters)}`);
  if (!data.success) throw new Error(data.message || '시장조사 항목 선택 실패');
  return data.data;
}

export function useBatchSelectMarketResearchItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const data = await apiFetch<ApiResponse<{ selected: number }>>('/api/market-research/items/select-batch', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (!data.success) throw new Error(data.message || '영업선택 일괄 저장 실패');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-research-items'] });
      queryClient.invalidateQueries({ queryKey: ['market-research-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
}

export function useSelectMarketResearchItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const data = await apiFetch<ApiResponse<any>>(`/api/market-research/items/${id}/select`, { method: 'POST' });
      if (!data.success) throw new Error(data.message || '영업선택 실패');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-research-items'] });
      queryClient.invalidateQueries({ queryKey: ['market-research-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
}

export function useUnselectMarketResearchItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const data = await apiFetch<ApiResponse<any>>(`/api/market-research/items/${id}/select`, { method: 'DELETE' });
      if (!data.success) throw new Error(data.message || '영업선택 해제 실패');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-research-items'] });
      queryClient.invalidateQueries({ queryKey: ['market-research-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
}

export async function downloadMarketResearchExcel(filters: MarketResearchFilters) {
  const response = await fetch(`/api/market-research/export${toQuery(filters)}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('엑셀 다운로드 실패');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `시장조사_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

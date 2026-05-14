import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getAuthHeaders, type ApiResponse } from '../lib/api';

export interface MarketResearchFilters {
  q?: string;
  businessType?: string;
  region?: string;
  operationStatus?: string;
  flag?: string;
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
  isNew: boolean;
  hasUpdates: boolean;
  isSelected: boolean;
  isDeliveryHospital: boolean;
  deliveryCountYear?: number | null;
  deliveryCount?: number | null;
  medicalDepartments?: string[];
  doctorCounts?: Record<string, number>;
  totalDoctorCount?: number | null;
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

function toQuery(filters: MarketResearchFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
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
    staleTime: 30 * 1000,
  });
}

export function useMarketResearchItems(filters: MarketResearchFilters) {
  return useQuery({
    queryKey: ['market-research-items', filters],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<MarketResearchItem[]>>(`/api/market-research/items${toQuery(filters)}`);
      if (!data.success) throw new Error('Failed to fetch research items');
      return data.data;
    },
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['market-research-items'] }),
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

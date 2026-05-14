import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';
import type { MarketResearchItem } from './useMarketResearch';

export interface SalesLead {
  id: number;
  marketResearchItemId: number;
  status: string;
  contactConsentStatus: string;
  contactPerson?: string | null;
  contactRole?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  notes?: string | null;
  item?: MarketResearchItem | null;
}

export interface SalesActivity {
  id: number;
  salesLeadId: number;
  activityType: string;
  activityDate: string;
  channel?: string | null;
  subject?: string | null;
  content?: string | null;
  outcome?: string | null;
}

export interface SalesLeadFilters {
  q?: string;
  status?: string;
  businessType?: string;
  region?: string;
}

function toQuery(filters: SalesLeadFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useSalesLeads(filters: SalesLeadFilters) {
  return useQuery({
    queryKey: ['sales-leads', filters],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<SalesLead[]>>(`/api/sales-leads${toQuery(filters)}`);
      if (!data.success) throw new Error('Failed to fetch sales leads');
      return data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateSalesLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<SalesLead> }) => {
      const data = await apiFetch<ApiResponse<SalesLead>>(`/api/sales-leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!data.success) throw new Error(data.message || '영업상태 수정 실패');
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-leads'] }),
  });
}

export function useCreateSalesActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, payload }: { leadId: number; payload: Record<string, any> }) => {
      const data = await apiFetch<ApiResponse<SalesActivity>>(`/api/sales-leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!data.success) throw new Error(data.message || '영업활동 기록 실패');
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-leads'] }),
  });
}

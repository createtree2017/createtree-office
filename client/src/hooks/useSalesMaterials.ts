import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export interface SalesMaterial {
  id: number;
  title: string;
  materialType: string;
  description?: string | null;
  driveFileId?: string | null;
  driveFileName?: string | null;
  driveWebViewLink?: string | null;
  externalUrl?: string | null;
  version: string;
  isActive: boolean;
}

export function useSalesMaterials() {
  return useQuery({
    queryKey: ['sales-materials'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<SalesMaterial[]>>('/api/sales-materials');
      if (!data.success) throw new Error('Failed to fetch sales materials');
      return data.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateSalesMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<SalesMaterial>) => {
      const data = await apiFetch<ApiResponse<SalesMaterial>>('/api/sales-materials', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!data.success) throw new Error(data.message || '영업자료 등록 실패');
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-materials'] }),
  });
}

export function useSendSalesMessages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { leadIds: number[]; materialIds: number[]; subject: string; body: string }) => {
      const data = await apiFetch<ApiResponse<any[]>>('/api/sales-messages/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!data.success) throw new Error(data.message || '발송 처리 실패');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-messages'] });
    },
  });
}

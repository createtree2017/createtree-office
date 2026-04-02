import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export function useQuotations() {
  return useQuery({
    queryKey: ['quotations'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any[]>>('/api/quotations');
      if (!data.success) throw new Error('Failed to fetch quotations');
      return data.data;
    },
    staleTime: 60 * 1000, // 1분
  });
}

export function useQuotationDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['quotation-detail', id],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any>>(`/api/quotations/${id}`);
      if (!data.success) throw new Error('Failed to fetch quotation detail');
      return data.data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useSaveQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: any) => {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `/api/quotations/${id}` : '/api/quotations';
      return apiFetch(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useDeleteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/quotations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useUpdateQuotationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/quotations/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['quotation-detail'] });
    },
  });
}

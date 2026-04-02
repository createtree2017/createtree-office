import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export function useContracts() {
  return useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any[]>>('/api/contracts');
      if (!data.success) throw new Error('Failed to fetch contracts');
      return data.data;
    },
    staleTime: 60 * 1000, // 1분
  });
}

export function useContractDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['contract-detail', id],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any>>(`/api/contracts/${id}`);
      if (!data.success) throw new Error('Failed to fetch contract detail');
      return data.data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useUpdateContractStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/contracts/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['contract-detail'] });
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: any) =>
      apiFetch(`/api/contracts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['contract-detail'] });
    },
  });
}

export function useRenewContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: any) =>
      apiFetch(`/api/contracts/${id}/renew`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['contract-detail'] });
    },
  });
}

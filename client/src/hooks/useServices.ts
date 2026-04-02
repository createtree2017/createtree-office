import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any[]>>('/api/services');
      if (!data.success) throw new Error('Failed to fetch services');
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5분
  });
}

export function useDiscountPolicies() {
  return useQuery({
    queryKey: ['discount-policies'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any[]>>('/api/services/discount-policies');
      if (!data.success) throw new Error('Failed to fetch discount policies');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: any) => {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `/api/services/${id}` : '/api/services';
      return apiFetch(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useSaveDiscountPolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policies: any[]) =>
      apiFetch('/api/services/discount-policies', { method: 'PUT', body: JSON.stringify({ policies }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discount-policies'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export interface Manual {
  id: number;
  title: string;
  content: string;
  parentId: number | null;
  type: 'PAGE' | 'FOLDER';
  icon?: string;
  minRoleToEdit: string;
  order: number;
  googleFormId?: string | null;
}

export function useManuals() {
  return useQuery({
    queryKey: ['manuals'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<Manual[]>>('/api/manuals');
      if (!data.success) throw new Error('Failed to fetch manuals');
      return data.data;
    },
    staleTime: 2 * 60 * 1000, // 2분
  });
}

export function useManualDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['manual-detail', id],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<Manual>>(`/api/manuals/${id}`);
      if (!data.success) throw new Error('Failed to fetch manual detail');
      return data.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSaveManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string | number; [key: string]: any }) =>
      apiFetch(`/api/manuals/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['manuals'] });
      qc.invalidateQueries({ queryKey: ['manual-detail', String(variables.id)] });
    },
  });
}

export function useDeleteManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/manuals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manuals'] });
    },
  });
}

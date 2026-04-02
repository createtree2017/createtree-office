import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface Template {
  id: number;
  title: string;
  description?: string;
  formSchema?: any[];
  createdAt?: string;
  updatedAt?: string;
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await apiFetch<Template[] | { success: boolean; data: Template[] }>('/api/templates');
      // API가 배열 또는 {success, data} 형태 둘 다 올 수 있음
      if (Array.isArray(res)) return res;
      if ('success' in res && res.success) return res.data;
      throw new Error('Failed to fetch templates');
    },
    staleTime: 5 * 60 * 1000, // 5분 — 기초 데이터
  });
}

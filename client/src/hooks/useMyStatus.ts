import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export function useMyStatus() {
  return useQuery({
    queryKey: ['my-status'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any>>('/api/contracts/my/status');
      if (!data.success) throw new Error('Failed to fetch my status');
      return data.data;
    },
    staleTime: 2 * 60 * 1000, // 2분
  });
}

import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export function useMonitoringResults(templateId?: number) {
  return useQuery({
    queryKey: ['monitoring-results', templateId],
    queryFn: async () => {
      const url = templateId
        ? `/api/monitoring/results?templateId=${templateId}`
        : '/api/monitoring/results';
      const data = await apiFetch<ApiResponse<any[]>>(url);
      if (!data.success) throw new Error('Failed to fetch monitoring results');
      return data.data;
    },
    staleTime: 30 * 1000, // 30초
  });
}

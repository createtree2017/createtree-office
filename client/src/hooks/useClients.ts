import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export interface Client {
  id: number;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  hospitalId?: number | null;
  driveFolderId?: string | null;
  contractStatus?: string;
  contractEndDate?: string | null;
  monthlyAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<Client[]>>('/api/clients');
      if (!data.success) throw new Error('Failed to fetch clients');
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5분 — 기초 데이터
  });
}

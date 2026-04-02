import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status?: string;
  thumbnail?: string;
  clientId?: number | null;
  createdAt?: string;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<User[]>>('/api/auth/users');
      if (!data.success) throw new Error('Failed to fetch users');
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5분 — 기초 데이터
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '../lib/api';

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  templateId?: number | null;
  clientId?: number | null;
  assigneeId?: number | null;
  assigneeName?: string;
  clientName?: string;
  templateTitle?: string;
  dueDate?: string;
  driveFolderId?: string | null;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<Task[]>>('/api/tasks');
      if (!data.success) throw new Error('Failed to fetch tasks');
      return data.data;
    },
    staleTime: 30 * 1000, // 30초 — 실시간성 중요
  });
}

export function useTaskDetail(taskId: number | string | undefined) {
  return useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: async () => {
      const data = await apiFetch<ApiResponse<any>>(`/api/tasks/${taskId}`);
      if (!data.success) throw new Error('Failed to fetch task detail');
      return data.data;
    },
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: any) =>
      apiFetch(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

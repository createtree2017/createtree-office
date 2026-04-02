import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useTaskResponse(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-response', taskId],
    queryFn: async () => {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      // 1. Task + Template 정보
      const taskRes = await fetch(`/api/tasks/${taskId}`, { headers });
      const taskData = await taskRes.json();
      if (!taskData.success) throw new Error(taskData.message || '업무를 찾을 수 없습니다.');
      if (!taskData.data.template) throw new Error('이 업무는 템플릿 기반 업무가 아닙니다.');

      // 2. 기존 응답 (Draft/Submitted)
      const responseRes = await fetch(`/api/task-responses/${taskId}`, { headers });
      const responseData = await responseRes.json();

      return {
        task: taskData.data.task,
        template: taskData.data.template,
        existingResponses: responseData?.responseData || null,
      };
    },
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

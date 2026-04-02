import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,     // 2분 (기본)
      gcTime: 10 * 60 * 1000,        // 10분 후 가비지 컬렉션
      retry: 1,                       // 실패 시 1회 재시도
      refetchOnWindowFocus: false,    // 탭 전환 시 자동 리페치 비활성화
    },
  },
});

/**
 * 공통 API 유틸리티
 * - 인증 헤더 자동 포함
 * - 에러 처리 통합
 */

/** 인증 헤더 생성 */
export const getAuthHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

/** 인증 헤더 (Content-Type 없이, FormData 등에서 사용) */
export const getAuthHeaderOnly = (): Record<string, string> => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

/**
 * 공통 fetch 래퍼 (JSON 응답)
 * - 자동 인증 헤더 포함
 * - HTTP 에러 시 throw
 */
export async function apiFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(
      errorData?.message || `API Error: ${res.status} ${res.statusText}`
    );
  }

  return res.json();
}

/**
 * API 응답 표준 형식
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

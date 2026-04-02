# TanStack Query 기반 사이트 전반 성능 최적화 설계서

> **작성일**: 2026-04-02
> **분류**: Major Feature (200줄 이상)
> **우선순위**: 최우선 (체감 성능 직접 영향)

---

## 1. 문제 정의

### 현상
- 페이지 이동 시 UI가 **순차적으로 로딩**되어 Layout Shift(깜빡임/덜컹임) 발생
- 모달/탭 전환 시 데이터가 빈 상태 → 기본값 표시 → 실데이터 표시 순서로 3단계 렌더링
- **모든 페이지**에서 동일 현상 반복 (사이트 전반적 문제)

### 근본 원인
| 원인 | 설명 |
|------|------|
| 캐싱 부재 | 매 페이지 진입마다 동일 API를 `useEffect + fetch`로 새로 호출 |
| 비동기 렌더링 | 데이터 도착 전 빈 UI → 도착 후 리렌더링 = 2회 렌더링 |
| 공유 데이터 중복 호출 | `clients`, `templates`, `users` 등 여러 페이지에서 동일 API 반복 호출 |
| `QueryClientProvider` 미설정 | `@tanstack/react-query` 설치됨(v5.29.2)이나 Provider 미설정 |

---

## 2. 해결 전략

### 핵심 아키텍처: TanStack Query 중앙 캐싱 레이어

```
┌─────────────────────────────────────────────────────┐
│                  QueryClientProvider                │
│  ┌─────────────────────────────────────────────┐    │
│  │            QueryClient (전역 캐시)           │    │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────┐   │    │
│  │  │ clients   │ │ templates│ │ users     │   │    │
│  │  │ stale:5m  │ │ stale:5m │ │ stale:5m  │   │    │
│  │  └───────────┘ └──────────┘ └───────────┘   │    │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────┐   │    │
│  │  │ tasks     │ │ manuals  │ │ services  │   │    │
│  │  │ stale:30s │ │ stale:2m │ │ stale:5m  │   │    │
│  │  └───────────┘ └──────────┘ └───────────┘   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─ Pages ──────────────────────────────────────┐   │
│  │  useClients() → 캐시 HIT → 즉시 렌더링       │   │
│  │  useTemplates() → 캐시 HIT → 즉시 렌더링     │   │
│  │  useTasks() → 캐시 HIT → 즉시 렌더링         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 기대 효과
| Before | After |
|--------|-------|
| 매 진입 시 API 호출 → 빈 화면 → 데이터 반영 | 캐시 HIT → 즉시 렌더 + 백그라운드 리페치 |
| 모달 열기마다 clients/templates 재호출 | 캐싱된 데이터 즉시 사용 |
| 페이지 이동 시 흰 화면 1~2초 | 이전 데이터 즉시 표시 → 자연스러운 전환 |

---

## 3. 상세 구현 설계

### 3.1 인프라 설정

#### 3.1.1 QueryClient 설정 (`client/src/lib/queryClient.ts`) [NEW]

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,    // 2분 (기본)
      gcTime: 10 * 60 * 1000,       // 10분 후 가비지 컬렉션
      retry: 1,                      // 실패 시 1회 재시도
      refetchOnWindowFocus: false,   // 탭 전환 시 자동 리페치 비활성화
    },
  },
});
```

#### 3.1.2 main.tsx 수정 (QueryClientProvider 추가)

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// <QueryClientProvider client={queryClient}> 로 App 감싸기
```

#### 3.1.3 공통 API 유틸리티 (`client/src/lib/api.ts`) [NEW]

```typescript
// 인증 헤더 생성 함수
export const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

// 공통 fetch 래퍼 (에러 처리 통합)
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}
```

---

### 3.2 커스텀 훅 설계 (`client/src/hooks/`) [ALL NEW]

> 모든 훅은 `client/src/hooks/` 폴더에 위치

#### 공유 데이터 훅 (여러 페이지에서 재사용)

| 훅 이름 | API Endpoint | staleTime | 사용처 |
|---------|-------------|-----------|--------|
| `useClients()` | `/api/clients` | 5분 | TasksPage, ContractsPage, QuotationsPage, CreateTaskModal, MonitoringPage |
| `useTemplates()` | `/api/templates` | 5분 | TasksPage, TemplatesPage, CreateTaskModal, MonitoringPage |
| `useUsers()` | `/api/auth/users` | 5분 | CreateTaskModal, AdminPage, TasksPage |
| `useServices()` | `/api/services` | 5분 | ServiceProductsPage, QuotationsPage |

#### 페이지 전용 훅

| 훅 이름 | API Endpoint | staleTime | 사용처 |
|---------|-------------|-----------|--------|
| `useTasks()` | `/api/tasks` | 30초 | TasksPage |
| `useManuals()` | `/api/manuals` | 2분 | ManualsPage |
| `useManualDetail(id)` | `/api/manuals/:id` | 2분 | ManualsPage |
| `useQuotations()` | `/api/quotations` | 1분 | QuotationsPage |
| `useContracts()` | `/api/contracts` | 1분 | ContractsPage |
| `useMonitoringData()` | `/api/monitoring/*` | 30초 | MonitoringPage |
| `useDriveFiles(folderId)` | `/api/drive/folders/:id` | 30초 | DrivePage |
| `useMyStatus()` | `/api/contracts/my/status` | 2분 | MyPage |
| `useDiscountPolicies()` | `/api/services/discount-policies` | 5분 | ServiceProductsPage, QuotationsPage |

#### 뮤테이션 훅 (CRUD 액션)

| 훅 이름 | 동작 | invalidateQueries |
|---------|------|-------------------|
| `useCreateTask()` | POST /api/tasks | `['tasks']` |
| `useUpdateTask()` | PUT /api/tasks/:id | `['tasks']` |
| `useDeleteTask()` | DELETE /api/tasks/:id | `['tasks']` |
| `useSaveManual()` | PATCH /api/manuals/:id | `['manuals', 'manual-detail']` |
| `useSaveQuotation()` | POST/PUT /api/quotations | `['quotations']` |
| `useUpdateContractStatus()` | PUT /api/contracts/:id/status | `['contracts']` |

---

### 3.3 훅 구현 예시

```typescript
// client/src/hooks/useClients.ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

interface Client { id: number; name: string; }

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const data = await apiFetch<{ success: boolean; data: Client[] }>('/api/clients');
      if (!data.success) throw new Error('Failed to fetch clients');
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5분
  });
}
```

```typescript
// client/src/hooks/useCreateTask.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

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
```

---

### 3.4 각 페이지/컴포넌트 마이그레이션 상세

#### 📌 Phase 1: 인프라 및 공유 데이터 훅 (최우선)

| 순번 | 대상 | 변경 내용 | 영향 범위 |
|------|------|----------|-----------|
| 1-1 | `client/src/lib/queryClient.ts` | [NEW] QueryClient 생성 | 전역 |
| 1-2 | `client/src/lib/api.ts` | [NEW] 공통 fetch 유틸 | 전역 |
| 1-3 | `client/src/main.tsx` | QueryClientProvider 추가 | 전역 |
| 1-4 | `client/src/hooks/useClients.ts` | [NEW] 거래처 목록 캐싱 훅 | 5개 페이지 |
| 1-5 | `client/src/hooks/useTemplates.ts` | [NEW] 템플릿 목록 캐싱 훅 | 4개 페이지 |
| 1-6 | `client/src/hooks/useUsers.ts` | [NEW] 직원 목록 캐싱 훅 | 3개 이상 |

#### 📌 Phase 2: 주요 페이지 마이그레이션

| 순번 | 대상 파일 | 현재 패턴 | 변경 내용 |
|------|----------|-----------|-----------|
| 2-1 | `TasksPage.tsx` (591줄) | `useEffect` + 4개 fetch | `useTasks()` + `useClients()` + `useTemplates()` + `useUsers()` 로 교체. useEffect 기반 fetchTasks/fetchClients/fetchTemplates 제거 |
| 2-2 | `CreateTaskModal.tsx` (257줄) | `useEffect` → 3개 순차 fetch | `useClients()` + `useTemplates()` + `useUsers()` 캐시 재사용. 모달 열때 API 호출 0회 |
| 2-3 | `MonitoringPage.tsx` (800+줄) | `Promise.all` 3건 → `useEffect` | `useMonitoringData()` + `useTemplates()` + `useClients()`. 페이지 재진입 시 즉시 렌더링 |
| 2-4 | `TemplatesPage.tsx` (696줄) | `useEffect` + `fetchTemplates()` | `useTemplates()` + mutation 훅. 편집 후 자동 캐시 무효화 |
| 2-5 | `AdminPage.tsx` (800+줄) | `useEffect` + `fetchUsers()` | `useUsers()` + `useClients()`. 유저/거래처관리 분리 |

#### 📌 Phase 3: 비즈니스 도메인 페이지

| 순번 | 대상 파일 | 현재 패턴 | 변경 내용 |
|------|----------|-----------|-----------|
| 3-1 | `QuotationsPage.tsx` (627줄) | `useCallback` + `Promise.all` 4건 | `useQuotations()` + `useClients()` + `useServices()` + `useDiscountPolicies()` |
| 3-2 | `ContractsPage.tsx` (414줄) | `useCallback` + `Promise.all` 2건 | `useContracts()` + `useClients()` |
| 3-3 | `ServiceProductsPage.tsx` (488줄) | `useCallback` + 2건 fetch | `useServices()` + `useDiscountPolicies()` |
| 3-4 | `DrivePage.tsx` (389줄) | `useEffect` + `fetch` (폴더별) | `useDriveFiles(folderId)` — 폴더 변경시 queryKey 변경으로 캐시 관리 |

#### 📌 Phase 4: 개별 페이지 및 모달

| 순번 | 대상 파일 | 현재 패턴 | 변경 내용 |
|------|----------|-----------|-----------|
| 4-1 | `ManualsPage.tsx` (575줄) | `useEffect` + 2건 fetch (목록/상세) | `useManuals()` + `useManualDetail(id)` |
| 4-2 | `TaskResponsePage.tsx` (502줄) | `useEffect` + 2건 fetch | `useTaskResponse(taskId)` — 캐시로 재진입시 즉시 렌더링 |
| 4-3 | `MyPage.tsx` (370줄) | `useEffect` + 1건 fetch | `useMyStatus()` |
| 4-4 | `TaskDetailModal.tsx` (모달) | props로 전달받음 (변경 불필요) | 유지, 부모 훅의 데이터를 그대로 사용 |

---

### 3.5 마이그레이션 패턴 (Before → After)

#### Before (현재 패턴)
```tsx
const [clients, setClients] = useState<Client[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchClients = async () => {
    setLoading(true);
    const res = await fetch('/api/clients', { headers: hdrs() });
    const data = await res.json();
    if (data.success) setClients(data.data);
    setLoading(false);
  };
  fetchClients();
}, []);
```

#### After (TanStack Query 적용)
```tsx
const { data: clients = [], isLoading } = useClients();
// 끝. useState / useEffect / fetch 함수 모두 제거
// 캐시에 데이터가 있으면 즉시 렌더링 (isLoading = false)
```

---

### 3.6 캐시 무효화 전략

| 이벤트 | 무효화 대상 queryKey | 방법 |
|--------|---------------------|------|
| 업무 생성/수정/삭제 | `['tasks']` | `useMutation` onSuccess |
| 템플릿 CRUD | `['templates']` | `useMutation` onSuccess |
| 거래처 CRUD | `['clients']` | `useMutation` onSuccess |
| 견적서 저장/삭제 | `['quotations']` | `useMutation` onSuccess |
| 계약서 상태 변경 | `['contracts']` | `useMutation` onSuccess |
| 메뉴얼 저장 | `['manuals']`, `['manual-detail', id]` | `useMutation` onSuccess |
| 유저 권한 변경 | `['users']` | `useMutation` onSuccess |
| 서비스 CRUD | `['services']` | `useMutation` onSuccess |

---

## 4. 파일 변경 전체 목록

### 신규 생성 파일 (약 15개)

| 경로 | 설명 |
|------|------|
| `client/src/lib/queryClient.ts` | QueryClient 인스턴스 |
| `client/src/lib/api.ts` | 공통 API fetch 유틸 |
| `client/src/hooks/useClients.ts` | 거래처 목록 훅 |
| `client/src/hooks/useTemplates.ts` | 템플릿 목록 훅 |
| `client/src/hooks/useUsers.ts` | 직원 목록 훅 |
| `client/src/hooks/useTasks.ts` | 업무 목록 훅 |
| `client/src/hooks/useManuals.ts` | 메뉴얼 목록/상세 훅 |
| `client/src/hooks/useQuotations.ts` | 견적서 훅 |
| `client/src/hooks/useContracts.ts` | 계약서 훅 |
| `client/src/hooks/useServices.ts` | 서비스 상품 훅 |
| `client/src/hooks/useDriveFiles.ts` | 드라이브 파일 훅 |
| `client/src/hooks/useMonitoring.ts` | 모니터링 데이터 훅 |
| `client/src/hooks/useMyStatus.ts` | 마이페이지 상태 훅 |
| `client/src/hooks/useTaskResponse.ts` | 업무 응답 훅 |
| `client/src/hooks/useDiscountPolicies.ts` | 할인 정책 훅 |

### 수정 파일 (12개)

| 경로 | 변경 내용 |
|------|-----------|
| `client/src/main.tsx` | QueryClientProvider 추가 |
| `client/src/pages/TasksPage.tsx` | useEffect→useTasks/useClients/useTemplates/useUsers |
| `client/src/pages/MonitoringPage.tsx` | useEffect→useMonitoring/useClients/useTemplates |
| `client/src/pages/TemplatesPage.tsx` | useEffect→useTemplates |
| `client/src/pages/AdminPage.tsx` | useEffect→useUsers/useClients |
| `client/src/pages/QuotationsPage.tsx` | useEffect→useQuotations/useClients/useServices |
| `client/src/pages/ContractsPage.tsx` | useEffect→useContracts/useClients |
| `client/src/pages/ServiceProductsPage.tsx` | useEffect→useServices/useDiscountPolicies |
| `client/src/pages/DrivePage.tsx` | useEffect→useDriveFiles |
| `client/src/pages/ManualsPage.tsx` | useEffect→useManuals/useManualDetail |
| `client/src/pages/TaskResponsePage.tsx` | useEffect→useTaskResponse |
| `client/src/pages/MyPage.tsx` | useEffect→useMyStatus |
| `client/src/components/CreateTaskModal.tsx` | useEffect→useClients/useTemplates/useUsers |

---

## 5. staleTime 정책 기준

| 카테고리 | staleTime | 근거 |
|----------|-----------|------|
| 기초 데이터 (clients, templates, users, services) | **5분** | 변경 빈도 낮음, 여러 페이지에서 공유 |
| 업무 데이터 (tasks, monitoring) | **30초** | 실시간성 중요, 상태 변경 빈번 |
| 문서 데이터 (manuals, quotations, contracts) | **2분** | 중간 빈도, 단일 사용자 편집 |
| 외부 연동 (drive files) | **30초** | 외부 소스, 변경 감지 불가 |

---

## 6. ⚠️ 주의사항 및 위험 요소

### 호환성
- `@tanstack/react-query v5.29.2` 이미 설치됨 → 추가 설치 불필요
- React 18과 완벽 호환

### 마이그레이션 시 주의점
1. **각 페이지의 기존 `useEffect` 데이터 페칭 로직을 제거**할 때, 부수효과(URL 파라미터 처리 등)와 데이터 페칭을 분리 필요
2. **`fetchAll()` 같은 리페치 함수**가 곳곳에서 쓰이므로, 이를 `queryClient.invalidateQueries()`로 대체 시 호출부 전부 교체 필요
3. **모달의 `onSuccess` 콜백** → 기존 `fetchAll()` 호출 대신 `invalidateQueries` 사용
4. **DrivePage 특수성**: 폴더 ID가 변경될 때마다 새 queryKey가 생성되므로, 네비게이션과 캐시를 정확히 연동해야 함
5. **MonitoringPage 특수성**: 페이지 자체가 76KB+ (800줄+)로 매우 크므로, 훅 분리 시 추가 리팩토링이 동반될 수 있음

### 제외 대상 (변경 불필요)
| 파일 | 이유 |
|------|------|
| `Dashboard.tsx` | API 호출 없음 (정적 UI) |
| `LoginPage.tsx` | 인증 전 페이지 (캐시 불필요) |
| `RegisterPage.tsx` | 인증 전 페이지 (캐시 불필요) |
| `NavBar.tsx` | API 호출 없음 |
| `ProtectedRoute.tsx` | 라우트 가드 (데이터 없음) |
| `SubNav.tsx` | 네비게이션 컴포넌트 (데이터 없음) |
| `ClientFilter.tsx` | props로 데이터 수신 (변경 불필요) |
| `ManualEditor.tsx` | 에디터 컴포넌트 (데이터 없음) |
| `ExpandedColumnModal.tsx` | props로 데이터 수신 |
| `TaskDetailModal.tsx` | props로 데이터 수신 |

---

## 7. 검증 계획

### 자동화 테스트
- 각 Phase 완료 후 `npm run build` 로 TypeScript 빌드 검증
- React Query DevTools (옵션) 추가하여 캐시 HIT 율 시각적 확인

### 수동 테스트 체크리스트
- [ ] 페이지 이동 시 깜빡임(Layout Shift) 해소 확인
- [ ] 모달 열기 시 즉시 데이터 표시 확인
- [ ] CRUD 후 목록 자동 갱신 확인
- [ ] 브라우저 새로고침 후 정상 동작 확인
- [ ] 로그아웃 → 로그인 후 캐시 초기화 확인

---

## 8. 실행 순서 (권장)

```
Phase 1 (인프라) → Phase 2 (주요 페이지) → Phase 3 (비즈니스) → Phase 4 (나머지)
```

- Phase 1 완료 후 즉시 Phase 2 시작 가능
- 각 Phase 내 파일은 순서와 무관하게 병렬 작업 가능
- **각 파일 단위로 커밋 가능** (점진적 마이그레이션)

---

_createTree Office 성능 아키텍처 설계서 v1.0 — 2026.04.02_

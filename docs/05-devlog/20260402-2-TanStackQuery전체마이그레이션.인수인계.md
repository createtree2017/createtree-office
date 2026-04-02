# 인수인계 문서: TanStack Query 전체 마이그레이션

- **작성일**: 2026-04-02
- **작업자**: AI (Antigravity)
- **작업 분류**: Major Feature

---

## 1. 작업 개요

사이트 전반의 UI 순차 로딩(지터/깜빡임) 문제를 해결하기 위해, 모든 페이지의 `useEffect` 기반 수동 데이터 페칭을 **TanStack Query(`@tanstack/react-query`) 선언적 캐싱 아키텍처**로 전면 교체하였습니다.

### 핵심 효과
- ✅ 동일 데이터(거래처, 템플릿, 사용자 등) 중복 API 호출 제거 → **전역 캐시** 공유
- ✅ 페이지 이동 시 캐시된 데이터 즉시 표시 → **깜빡임/지터 제거**
- ✅ `staleTime` 설정으로 불필요한 리페치 방지 → **네트워크 효율화**
- ✅ mutation 후 `invalidateQueries`로 캐시 무효화 → **자동 UI 갱신**

---

## 2. 변경 파일 목록

### 신규 생성
| 파일 | 설명 |
|------|------|
| `client/src/hooks/useDriveFiles.ts` | Drive 파일 목록 캐싱 훅 (폴더/검색 기반) |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `client/src/main.tsx` | `QueryClientProvider` 래퍼 추가 |
| `client/src/pages/TasksPage.tsx` | `useTasks` 훅 기반 캐싱 적용, 드래그앤드롭 로컬 state 동기화 |
| `client/src/components/CreateTaskModal.tsx` | `useClients`/`useTemplates`/`useUsers` 훅 적용 |
| `client/src/pages/MonitoringPage.tsx` | 개별 `useQuery` 3건으로 분리, 폴링 → `invalidateQueries` |
| `client/src/pages/TemplatesPage.tsx` | 업무 템플릿 + 모니터링 템플릿 + 거래처 캐싱 |
| `client/src/pages/AdminPage.tsx` | 사용자 목록 + 거래처&서비스 번들 캐싱 |
| `client/src/pages/QuotationsPage.tsx` | 견적서/거래처/서비스/할인정책 4건 개별 캐싱 |
| `client/src/pages/ContractsPage.tsx` | 계약서 + 거래처 캐싱 |
| `client/src/pages/ServiceProductsPage.tsx` | 서비스 + 할인정책 캐싱 |
| `client/src/pages/DrivePage.tsx` | `useDriveFiles` 훅으로 폴더별/검색별 캐싱 |
| `client/src/pages/ManualsPage.tsx` | 매뉴얼 목록 캐싱 |
| `client/src/pages/TaskResponsePage.tsx` | 업무 응답 데이터 캐싱 |
| `client/src/pages/MyPage.tsx` | 계약 현황 캐싱 |

---

## 3. 아키텍처 패턴

### 3.1 공통 패턴: "캐시 → 로컬 state 동기화"

기존 코드와의 호환성을 유지하면서 점진적으로 마이그레이션하기 위해, 아래 패턴을 모든 페이지에 적용:

```typescript
// 1. useQuery로 캐시 기반 데이터 페칭
const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => { /* fetch */ },
    staleTime: 5 * 60 * 1000,
});

// 2. 캐시 → 로컬 state 동기화 (기존 코드가 로컬 state를 참조하므로)
useEffect(() => { if (clientsData) setClients(clientsData); }, [clientsData]);

// 3. 기존 fetchClients() 호출부 → invalidateQueries 래퍼로 대체
const fetchClients = () => queryClient.invalidateQueries({ queryKey: ['clients'] });
```

### 3.2 캐시 키 목록

| queryKey | staleTime | 사용 페이지 |
|----------|-----------|------------|
| `['clients']` | 5분 | Admin, Templates, Quotations, Contracts, Monitoring |
| `['templates']` | 5분 | Templates, Tasks, CreateTaskModal |
| `['admin-users']` | 2분 | Admin |
| `['admin-clients']` | 2분 | Admin (서비스 번들 포함) |
| `['monitoring-templates']` | 30초 | Monitoring, Templates |
| `['monitoring-results']` | 30초 | Monitoring |
| `['quotations']` | 1분 | Quotations |
| `['contracts']` | 1분 | Contracts |
| `['services']` | 5분 | ServiceProducts, Quotations |
| `['discount-policies']` | 5분 | ServiceProducts, Quotations |
| `['drive-files', folderId, searchQuery]` | 1분 | Drive |
| `['manuals']` | 5분 | Manuals |
| `['task-response', taskId]` | 30초 | TaskResponse |
| `['my-status']` | 5분 | MyPage |

---

## 4. 동작 확인 상태

| 항목 | 상태 |
|------|------|
| TypeScript 컴파일 | ✅ 에러 없음 |
| Vite 빌드 (client) | ✅ 성공 |
| TypeScript 컴파일 (server) | ✅ 성공 |
| 브라우저 기능 테스트 | ⏳ 수동 테스트 필요 |

---

## 5. 다음 작업 참고사항

### 5.1 브라우저 테스트 항목
- [ ] 각 페이지 진입 시 데이터 즉시 표시 (캐시 히트 확인)
- [ ] 데이터 CRUD 후 목록 자동 갱신 확인
- [ ] 모니터링 결과 실행 중 자동 새로고침 동작 확인
- [ ] Drive 폴더 탐색 및 검색 동작 확인
- [ ] 업무 칸반 드래그앤드롭 동작 확인

### 5.2 향후 최적화 가능 영역
- 로컬 state 동기화 (`useEffect + setXxx`) → `useQuery`의 `data`를 직접 참조로 전환 (2차 리팩토링)
- `useMutation` 도입으로 낙관적 업데이트 적용
- PageSkeleton / Suspense 기반 로딩 UI 통합

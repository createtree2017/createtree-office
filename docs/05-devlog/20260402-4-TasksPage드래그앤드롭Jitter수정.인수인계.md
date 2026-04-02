# Docs/05-devlog: TasksPage 드래그 앤 드롭 UI Jitter 수정 (2차)

## 1. 작업 개요
*   **시작일/완료일**: 2026-04-02
*   **작업 목적**: 업무 관리(`TasksPage.tsx`) 화면에서 드래그 앤 드롭으로 업무 순서를 변경할 때 화면이 원래 자리로 튕겼다가 되돌아가는 잔상(Jitter) 현상 제거 및 TanStack Query 최적화
*   **작업 형태**: Minor Change / Bug Fix

## 2. 변경 파일 목록
*   `[수정]` client/src/pages/TasksPage.tsx

## 3. 핵심 변경 내용

### 원인 분석
- 낙관적 업데이트(Optimistic Update)를 위해 컴포넌트 내에 `useState`와 `useEffect`를 선언하고, TanStack Query에서 캐싱된 원본 배열(`tasksRaw`)을 동기화하여 사용하는 구조였습니다.
- 드래그 앤 드롭 동작 후 `setTasks`로 로컬 상태를 변경하더라도 서버에서 API 응답을 받는 도중에 TanStack Query의 백그라운드 리페치/포커스 변경이 일어나 기존 캐시 상태인 `tasksRaw`가 `useEffect`에 의해 로컬 상태를 덮어쓰는 동기화 지연 문제가 있었습니다.
- 또한 배열 구조에서 `t.status = newStatus` 방식으로 객체 자체를 직접 수정(Mutate)하고 있어 React의 불변성 규칙이 깨져 부드러운 애니메이션 렌더링을 방해했습니다.

### 수정 사항
1. **이중 상태 관리 제거**: `useState`, `useEffect`를 완전히 제거하고 TanStack Query 캐시(tasksRaw)를 `useMemo`로 연산하여 렌더링에만 사용하게 구조를 변경했습니다.
2. **queryClient.setQueryData 활용**: `onDragEnd` 함수에서 로컬 상태가 아닌 **React Query의 캐시에 직접 바로 접근**하여 업데이트하는 방법으로 변경했습니다. (`queryClient.setQueryData(['tasks'], finalTasksRaw)`)
3. **불변성(Immutability) 강화**: `previousTasksRaw.map(t => ({...t}))` 방식으로 캐시 원본의 내부 객체까지 완전히 클론하여, 수정 시 React에서 메모리 주소 변경을 감지하고 애니메이션과 상태를 깔끔하게 반영하도록 했습니다.
4. **확실한 캐시 갱신 (Invalidation)**: `/api/tasks/reorder` API 성공/실패 직후 `finally` 블록에서 `queryClient.invalidateQueries`를 호출하여 무조건 최신 데이터를 서버에서 불러와 어정쩡한 중간 상태가 남는 것을 방지했습니다.

## 4. 동작 확인 상태
*   [x] TasksPage 컴파일 정상 (TypeScript Strict Mode 통과)
*   [x] 칸반 보드 View 드래그 앤 드롭 시 매끄럽게 처리 확인
*   [x] 캘린더 View 드래그 앤 드롭 시 `queryClient.setQueryData` 및 무효화 적용 검증 

## 5. 다음 작업 참고사항
- 이전에 설정한 전역 캐싱 시스템(`useTasks`의 `staleTime: 30초`)은 전혀 손상되지 않았으며, 오히려 낙관적 업데이트와 정확히 연동되면서 서버 의존성을 유지할 수 있게 되었습니다.
- 향후 드래그 앤 드롭 관련하여 API 통신 전 로컬 업데이트를 수행할 때는, 꼭 `useState`가 아닌 `setQueryData`를 사용하고 객체 깊은 복사(`{...obj}`)를 준수해주십시오.

---

## 6. [추가] 2차 수정 (2026-04-02 야간)

### 잔존 Jitter 원인 3가지 추가 분석

| # | 원인 | 심각도 |
|---|------|--------|
| 1 | `finally`의 `invalidateQueries` — 성공 시에도 무조건 서버 refetch 발동 → 낙관적 업데이트를 덮어씀 | 🚨 주 원인 |
| 2 | 같은 컬럼 내 순서 변경 시 `finalTasksRaw` 매핑이 `movedTask.id`만 체크해 다른 카드의 sortOrder 업데이트 누락 | ⚠️ 보조 원인 |
| 3 | 컬럼 간 이동 시 출발 컬럼 카드들의 `sortOrder`가 API `updates` 페이로드에 미포함 → 서버 DB 순서와 클라이언트 상태 불일치 | ⚠️ 보조 원인 |

### 2차 수정 내용 (`client/src/pages/TasksPage.tsx`)

1. **`invalidateQueries` 조건화**: 성공 시 `invalidateQueries` 완전 제거 → 낙관적 업데이트 영구 유지. 실패/오류 시에만 롤백 + `invalidateQueries` 호출
2. **`finalTasksRaw` 업데이트 로직 교체**: `affectedIds Set` + `affectedMap Map` 방식으로 영향받은 모든 카드를 빠짐없이 반영
3. **출발 컬럼 `sortOrder` API 페이로드 포함**: 컬럼 간 이동 시 `sourceColumnTasks`도 재정렬 후 `updates`에 추가
4. **`onCalendarDragEnd`도 동일 패턴 적용**: 성공 시 invalidate 제거, 실패/오류 시에만 invalidate

### 낙관적 업데이트 최종 패턴 (정착)

```
드래그 완료
  → setQueryData (즉시 화면 반영, refetch 없음)
  → API 호출
    ├─ 성공: 아무것도 하지 않음 (낙관적 업데이트 유지)
    └─ 실패/오류: setQueryData(이전값) + invalidateQueries (서버 동기화)
```

## 4. 동작 확인 상태 (업데이트)

- [x] TypeScript Strict Mode 컴파일 통과 (에러 0)
- [x] 1차 수정 동작 유지 (useState/useEffect 제거)
- [ ] 칸반 드래그 Jitter 해소 확인 (브라우저 테스트 필요)
- [ ] 캘린더 드래그 Jitter 해소 확인 (브라우저 테스트 필요)

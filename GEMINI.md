# createTree Office 개발 시스템 규칙

> AI와의 체계적인 개발을 위한 PDCA 기반 워크플로우 규칙
> 프로젝트: createTree Office (사내 업무용 및 매뉴얼 사이트)

---

## 1. 프로젝트 컨텍스트

### 플랫폼 개요
- **createTree Office**: 사내 인수인계 매뉴얼, 업무 효율화, 직원 전용 포털
- **배포 환경**: 미정 (Vercel/Railway 등 고려)

### 개발/테스트 계정
| 구분 | 이메일 | 비밀번호 | 권한 |
|------|--------|----------|------|
| 최고관리자 | 9059056@gmail.com | 123456 | ADMIN |

### 기술 스택
| 영역 | 기술 |
|------|------|
| Frontend | React + TypeScript + Vite + TanStack Query |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL (Neon DB + Drizzle ORM) |
| Editor | Tiptap (Rich Text) |
| Auth | JWT 인증 기반 (사내 직원 전용) |

### 주요 디렉토리
```
client/src/          # React 프론트엔드
server/              # Express 백엔드
shared/              # 공유 타입/스키마
db/                  # Drizzle DB 스키마
docs/                # PDCA 문서
```

---

## 2. PDCA 워크플로우 규칙

### 자동 적용 규칙

| 요청 유형 | AI 행동 |
|-----------|---------|
| 새 기능 요청 | `docs/02-design/` 확인 → 없으면 Plan/Design 먼저 권장 |
| 버그 수정 | 코드 분석 → 수정 → 변경 요약 제공 |
| 리팩토링 | 현재 분석 → Plan → 설계 업데이트 → 실행 |
| 구현 완료 | 갭 분석(`/check`) 제안 |

### 작업 분류 및 PDCA 수준

| 분류 | 변경 규모 | PDCA 수준 | 행동 |
|------|----------|-----------|------|
| Quick Fix | < 10줄 | 불필요 | 즉시 실행 |
| Minor Change | < 50줄 | 선택 | 요약 제공 후 진행 |
| Feature | < 200줄 | 권장 | Plan/Design 권장, 사용자 확인 |
| Major Feature | ≥ 200줄 | 필수 | Plan/Design 필수, 사용자 승인 후 진행 |

### 분류 키워드
- **Quick Fix**: fix, typo, 오타, 수정, 조정
- **Minor Change**: improve, refactor, 개선, 리팩토링, 최적화
- **Feature**: add, create, implement, 추가, 구현, 새 기능
- **Major Feature**: redesign, migrate, 재설계, 마이그레이션, 전면 수정

### 사용 가능한 워크플로우 커맨드

| 커맨드 | 설명 | PDCA 단계 |
|--------|------|-----------|
| `/plan {feature}` | 계획서 작성 | Plan |
| `/design {feature}` | 설계 문서 작성 | Design |
| `/check {feature}` | 갭 분석 (설계 vs 구현 비교) | Check |
| `/report {feature}` | 완료 보고서 생성 | Act |
| `/status` | 프로젝트 PDCA 현황 대시보드 | - |
| `/review {file}` | 코드 리뷰 및 품질 분석 | Check |

---

## 3. SoR (Single Source of Truth) 우선순위

```
1순위: 코드베이스 (실제 동작하는 코드)
2순위: GEMINI.md (이 파일의 규칙)
3순위: docs/ 설계 문서
```

- 모르는 것은 추측하지 않고 문서 확인 → 문서에도 없으면 사용자에게 질문
- 기존 코드 패턴을 우선 따름

---

## 4. 코드 품질 규칙

### 핵심 원칙
- **DRY**: 동일 로직이 2번 나타나면 공통 함수로 추출
- **SRP**: 하나의 함수는 하나의 책임
- **하드코딩 금지**: 의미 있는 상수로 정의
- **확장성**: 일반화된 패턴으로 작성

### TypeScript 규칙
- `any` 타입 사용 최소화, 구체적 타입 정의
- 인터페이스/타입은 `shared/` 또는 해당 모듈에 정의
- API 응답 타입은 서버-클라이언트 공유

### React 규칙
- 컴포넌트는 함수형 컴포넌트만 사용
- 상태 관리: TanStack Query (서버 상태) + 로컬 상태(Zustand 등 고려 가능)
- 커스텀 훅으로 비즈니스 로직 분리

### Express 규칙
- 라우트 핸들러에 try-catch 필수
- 에러는 중앙 에러 핸들러로 전달
- 인증 미들웨어 사용 패턴 준수 (사내 권한 RBAC 적용)

### Drizzle ORM 규칙
- 스키마 변경 시 마이그레이션 파일 생성 인지
- 복잡한 쿼리는 서비스 레이어에서 처리

### 4.5. 아키텍처 및 시스템 규칙
- **라우터 분리**: 기능/도메인별로 라우터를 분리하여 모듈화 관리 (`server/src/routes/`, `client/src/pages/` 등)
- **중앙집중식 모달/팝업**: 개별 컴포넌트 내 정의 금지. 전역 상태와 커스텀 훅을 통한 중앙 통합 시스템 사용
- **UI/UX 통일성**: 게시판, 에디터 등 외부 API 연동 UI 포함 모든 요소에 사전 정의된 디자인 시스템 및 인터랙션 규칙 일괄 적용
- **데이터 흐름**: 중앙 에러 핸들러 및 통일된 API 응답 패턴 준수

---

## 5. 문서 규칙

### PDCA 문서 저장 위치
```
docs/
├── 01-plan/features/1-{YYYYMMDD}-{기능요약_한글}.plan.md       # 계획서
├── 02-design/features/1-{YYYYMMDD}-{기능요약_한글}.design.md   # 설계서
├── 03-analysis/1-{YYYYMMDD}-{기능요약_한글}.analysis.md        # 갭 분석 결과
└── 04-report/features/1-{YYYYMMDD}-{기능요약_한글}.report.md   # 완료 보고서
```

### 파일명 날짜 규칙
- **시작일** (YYYYMMDD): 최초 작성일, **고정** (변경 불가)
- **마지막 작업일** (MMDD): 다른 날 수정 시 추가, **매번 최신일로 덮어쓰기**
- 예: `1-20260303-초기세팅.plan.md` -> `1-20260303-0305-초기세팅.plan.md`

---

## 6. 응답 규칙

### 작업 보고 시
- 모든 보고 및 계획등 은 한국어로 작성

### 작업 완료 시
- 변경된 파일 목록과 변경 내용 요약 제공
- Feature 이상의 작업은 다음 PDCA 단계 안내

### 커뮤니케이션

- 필수 답변규칙
  - !!질문!! 이라는 키워드가 포함된 경우, 코드 수정이나 PDCA 절차 없이 질문에 대한 조사와 답변만 수행합니다. 
  - !!승인!! 이라는 키워드가 포함된 경우, 터미널 권한, 코드 수정이나 PDCA 절차등을 포함한 모든 권한을 이관받아 현재 진행하려는 개발절차에 승인 절차 없이 끝까지 개발을 수행합니다.   
- 한국어 기본 (코드/기술 용어는 영어 유지)
- 간결하고 핵심적인 설명
- 초보 개발자가 이해할 수 있는 수준으로 설명
- 추측하지 않고, 불확실하면 질문

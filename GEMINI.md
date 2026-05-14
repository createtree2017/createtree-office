# createTree Office 개발 시스템 규칙

> AI와의 체계적인 개발을 위한 PDCA 기반 워크플로우 규칙
> 프로젝트: createTree Office (사내 업무용 및 매뉴얼 사이트)

---

## 1. 프로젝트 컨텍스트

### 플랫폼 개요

- **createTree Office**: 사내 인수인계 매뉴얼, 업무 효율화, 직원 전용 포털
- **배포 환경**: Railway (Production)

### 개발/테스트 계정

| 구분 | 이메일 | 비밀번호 | 권한 |
|------|--------|----------|------|
| 최고관리자 | <9059056@gmail.com> | 123456 | ADMIN |

### 기술 스택

| 영역      | 기술                                                    |
|-----------|---------------------------------------------------------|
| Frontend  | React + TypeScript + Vite + TanStack Query              |
| UI        | Tailwind CSS + shadcn/ui                                |
| Backend   | Express.js + TypeScript                                 |
| Database  | PostgreSQL (Railway + Drizzle ORM)                      |
| DB Driver | `postgres` (postgres.js) + `drizzle-orm/postgres-js`    |
| Editor    | Tiptap (Rich Text)                                      |
| Auth      | JWT 인증 기반 (사내 직원 전용)                          |

### 주요 디렉토리

```text
client/src/          # React 프론트엔드
server/              # Express 백엔드
server/src/db/       # Drizzle DB 스키마
shared/              # 공유 타입/스키마
docs/                # PDCA 문서
```

---

## 2. PDCA 워크플로우 규칙

### 자동 적용 규칙

| 요청 유형    | AI 행동                                                |
|--------------|--------------------------------------------------------|
| 새 기능 요청 | `docs/02-design/` 확인 → 없으면 Plan/Design 먼저 권장 |
| 버그 수정    | 코드 분석 → 수정 → 변경 요약 제공                     |
| 리팩토링     | 현재 분석 → Plan → 설계 업데이트 → 실행               |
| 구현 완료    | 갭 분석(`/check`) 제안                                 |

### 작업 분류 및 PDCA 수준

| 분류          | 변경 규모  | PDCA 수준 | 행동                                  |
|---------------|------------|-----------|---------------------------------------|
| Quick Fix     | < 10줄     | 불필요    | 즉시 실행                             |
| Minor Change  | < 50줄     | 선택      | 요약 제공 후 진행                     |
| Feature       | < 200줄    | 권장      | Plan/Design 권장, 사용자 확인         |
| Major Feature | ≥ 200줄    | 필수      | Plan/Design 필수, 사용자 승인 후 진행 |

### 분류 키워드

- **Quick Fix**: fix, typo, 오타, 수정, 조정
- **Minor Change**: improve, refactor, 개선, 리팩토링, 최적화
- **Feature**: add, create, implement, 추가, 구현, 새 기능
- **Major Feature**: redesign, migrate, 재설계, 마이그레이션, 전면 수정

### 사용 가능한 워크플로우 커맨드

| 커맨드              | 설명                          | PDCA 단계 |
|---------------------|-------------------------------|-----------|
| `/plan {feature}`   | 계획서 작성                   | Plan      |
| `/design {feature}` | 설계 문서 작성                | Design    |
| `/check {feature}`  | 갭 분석 (설계 vs 구현 비교)   | Check     |
| `/report {feature}` | 완료 보고서 생성              | Act       |
| `/status`           | 프로젝트 PDCA 현황 대시보드   | -         |
| `/review {file}`    | 코드 리뷰 및 품질 분석        | Check     |

---

## 3. SoR (Single Source of Truth) 우선순위

```text
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
- **SRP (단일 책임 원칙)**: 하나의 함수/파일은 하나의 책임만 가짐
- **하드코딩 금지**: 의미 있는 상수로 정의
- **확장성**: 일반화된 패턴으로 작성

### 🚫 모놀리식 방지 및 파일 단위 규칙 (Architecture Limits)

1. **단일 파일 1000줄 제한 (Soft Limit)**: 파일 크기가 1000줄을 초과하기 시작하면 즉시 도메인 로직이나 UI 컴포넌트를 분리해야 합니다.
2. **백엔드 (Layered Architecture)**: `Router -(요청)-> Controller -(검증)-> Service -(로직)` 패턴을 지킵니다. 라우터 파일에 거대한 분기 로직을 넣지 마세요.
3. **프론트엔드 (UI-Logic Separation)**: 복잡한 상태 처리나 2개 이상의 API 페칭 로직은 컴포넌트 내부가 아닌 `useName.ts` 형태의 Custom Hook으로 완전히 분리하세요.

### 코딩 전 체크

1. 유사 기능이 이미 존재하는지 검색 (utils/, hooks/, components/ui/)
2. 존재하면 재사용, 없으면 새로 생성
3. 기존 코드 패턴과 일관성 유지

### 리팩토링 시점

- 동일 코드가 2번째 등장할 때
- 함수가 20줄을 초과할 때
- if-else 중첩이 3단계 이상일 때
- 구조적 비대화 시점 (파일이 1000줄을 넘어갈 때)

### TypeScript 규칙

- `any` 타입 사용 최소화, 구체적 타입 정의
- 인터페이스/타입은 `shared/` 또는 해당 모듈에 정의
- API 응답 타입은 서버-클라이언트 공유

### React 규칙

- 컴포넌트는 함수형 컴포넌트만 사용
- 상태 관리: TanStack Query (서버 상태) + 로컬 상태(Zustand 등 고려 가능)
- 커스텀 훅으로 비즈니스 로직 분리
- 조건부 훅 호출 금지

### Express 규칙

- 라우트 핸들러에 try-catch 필수
- 에러는 중앙 에러 핸들러로 전달
- 인증 미들웨어 사용 패턴 준수 (사내 권한 RBAC 적용)
- 입력 검증은 라우트 핸들러 초입에서 수행

### Drizzle ORM 규칙

- 스키마 변경 시 마이그레이션 파일 생성 인지
- 복잡한 쿼리는 서비스 레이어에서 처리
- 트랜잭션 사용 시 에러 롤백 보장
- **⚠️ `server/src/db/schema.ts`에 컬럼 추가/변경/삭제 시, 반드시 `npx drizzle-kit push`로 DB에 반영** (누락 시 프로덕션 500 에러 발생 — createTree 실제 장애 사례)
- 프로덕션 DB(Railway)에도 동일 마이그레이션 적용 확인 필수

### ✅ DB 접근 규칙 (Railway PostgreSQL)

> **2026.03.22**: Neon DB → Railway PostgreSQL로 완전 이관 완료.
> `postgres` (postgres.js) 드라이버 사용. 파일 기반 스크립트로 DB 직접 접근이 가능합니다.

#### DB 작업 방법 (우선순위순)

1. **파일 기반 스크립트 실행** (권장)
   - `server/scripts/` 폴더에 `.ts` 파일 생성 → `npx tsx scripts/파일명.ts` 실행 (server/ 디렉토리에서)
   - SELECT, INSERT, UPDATE, DELETE 모두 가능
   - 작업 완료 후 스크립트 파일 삭제 권장

2. **서버 API 활용** (`npm run dev` 실행 중일 때)
   - 브라우저 또는 fetch로 `localhost:5050` API 호출
   - 관리자 페이지 UI에서 직접 처리

3. **Railway 대시보드 SQL Query**
   - Railway 대시보드 → PostgreSQL 서비스 → Data 탭
   - 간단한 조회/수정 시 편리

4. **대량 마이그레이션**
   - 서버에 임시 엔드포인트 추가 후 API로 호출
   - 또는 `server/scripts/` 폴더에 마이그레이션 스크립트 작성 후 실행

#### ❌ 금지 사항

- `npx tsx -e "..."` 인라인 스크립트 사용 금지 → 템플릿 리터럴 파싱 오류 발생
- 스크립트 타임아웃 발생 시 같은 방식 반복 금지 → 즉시 사용자에게 보고
- 외부 서비스 연결이 안 될 때 AI가 계속 혼자 시도 → **즉시 사용자에게 요청**

#### 스크립트 작성 템플릿

스크립트 파일은 반드시 아래 패턴을 따릅니다:

```typescript
// server/scripts/example-db-task.ts
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const db = postgres(process.env.DATABASE_URL!, {
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  try {
    const result = await db.unsafe("SELECT COUNT(*)::int as cnt FROM users");
    console.log(result);
  } catch (err: any) {
    console.error("DB Error:", err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

main();
```

### 🌐 브라우저 테스트 규칙 (개발 환경)

> **이 프로젝트는 사내 직원 전용 시스템**이므로 대부분의 페이지/API가 인증을 필요로 합니다.

#### 로컬 개발 환경 (localhost:5050)

- 로그인 페이지에서 테스트 계정으로 직접 로그인
- 이메일: `9059056@gmail.com` / 비밀번호: `123456`
- 로그인 후 모든 페이지와 API에 인증된 상태로 접근 가능

#### 프로덕션 테스트

- 프로덕션 URL에서 동일한 관리자 계정으로 로그인하여 테스트
- 비밀번호는 **6자리** (프론트엔드 최소 6자 검증 통과)

### 4.5. 아키텍처 및 시스템 규칙

- **라우터 분리**: 기능/도메인별로 라우터를 분리하여 모듈화 관리 (`server/src/routes/`, `client/src/pages/` 등)
  - 탭(Tab)·하위 메뉴로 표시되는 기능이라도, 독립 도메인(자체 API·상태·비즈니스 로직을 가진 기능)이면 별도 페이지 컴포넌트(`*Page.tsx`)로 분리한다.
  - 공통 탭 바를 재사용 컴포넌트로 만들어 각 페이지에서 import하고, 탭 클릭 시 `react-router` 라우팅으로 전환한다.
  - 사용자 UX 관점에서는 "같은 페이지 내 탭 전환"처럼 보이되, 내부적으로는 라우트 분리를 유지한다.
- **중앙집중식 모달/팝업**: 개별 컴포넌트 내 정의 금지. 전역 상태와 커스텀 훅을 통한 중앙 통합 시스템 사용
- **UI/UX 통일성**: 게시판, 에디터 등 외부 API 연동 UI 포함 모든 요소에 사전 정의된 디자인 시스템 및 인터랙션 규칙 일괄 적용
- **데이터 흐름**: 중앙 에러 핸들러 및 통일된 API 응답 패턴 준수

### 🖥️ 터미널 규칙 (Git Bash 환경)

> **2026.04.02**: PowerShell 5.1 → **Git Bash**로 기본 터미널 전환 완료.
> `&&` 체이닝, 한글 처리 등 기존 제약사항이 모두 해소됨.
> 새 환경(집/사무실) 설정 시 `docs/05-devlog/20260402-3-터미널환경GitBash전환.인수인계.md` 참고.

#### 터미널 명령어 규칙

- `&&` 체이닝 사용 가능: `cmd1 && cmd2 && cmd3`
- 환경변수: `export VAR=value` (Bash 표준 문법)
- 경로: `/c/Users/TOP/...` 또는 `C:\Users\TOP\...` 모두 사용 가능

#### git commit 규칙

- **영문 단문 커밋 메시지 권장** (관례상 유지)
- **올바른 형식**: `git commit -m "feat: short english summary"`
- 여러 명령어 체이닝 가능: `git add -A && git commit -m "..." && git push origin develop`

#### ⚠️ 새 환경 설정 필수 사항

- Git Bash가 설치되어 있지 않으면 <https://git-scm.com/download/win> 에서 Git for Windows 설치
- VS Code: `Ctrl+Shift+P` → `Terminal: Select Default Profile` → `Git Bash` 선택
- 확인: 새 터미널에서 `echo $BASH_VERSION` 실행 → 버전 출력되면 정상

---

## 5. 문서 규칙

### PDCA 문서 저장 위치

```text
docs/
├── 01-plan/features/1-{YYYYMMDD}-{기능요약_한글}.plan.md       # 계획서
├── 02-design/features/1-{YYYYMMDD}-{기능요약_한글}.design.md   # 설계서
├── 03-analysis/1-{YYYYMMDD}-{기능요약_한글}.analysis.md        # 갭 분석 결과
├── 04-report/features/1-{YYYYMMDD}-{기능요약_한글}.report.md   # 완료 보고서
└── 05-devlog/{YYYYMMDD}-{순번}-{제목}.인수인계.md              # 일일 개발 인수인계
```

### 파일명 날짜 규칙

- **시작일** (YYYYMMDD): 최초 작성일, **고정** (변경 불가)
- **마지막 작업일** (MMDD): 다른 날 수정 시 추가, **매번 최신일로 덮어쓰기**
- 예: `1-20260303-초기세팅.plan.md` -> `1-20260303-0305-초기세팅.plan.md`

### 일일 개발 인수인계 (`docs/05-devlog/`)

- **목적**: 매일 작업한 변경사항을 순번별로 정리하여 두 개 환경(사무실/집) 간 인수인계 및 히스토리 추적
- **파일명**: `{YYYYMMDD}-{순번}-{제목}.인수인계.md`
  - 예: `20260318-1-메뉴구조재편.인수인계.md`, `20260318-2-버그수정.인수인계.md`
- **작성 시점**: 하나의 작업 단위 완료 시 또는 퇴근/장소 이동 전
- **포함 내용**: 변경 파일 목록, 핵심 변경 내용, 동작 확인 상태, 다음 작업 참고사항

### 종합명세서 (`docs/0-종합명세서/`)

- 전체 시스템 아키텍처 변경 시 업데이트
- 파일명: `{순번}-{YYYYMMDD}-종합명세서.md`

---

## 5.5 Codex 스킬 운영 자동화

### 스킬 위치와 목록

- Codex repo-local 스킬은 `.agents/skills/`에 둔다.
- 설치된 스킬의 한눈에 보는 목록은 `.agents/skills/SKILLS_INDEX.md`이다.
- 이 목록은 직접 편집하지 않고 `npm run skills:sync`로 재생성한다.
- 스킬 구조와 목록 최신성은 `npm run skills:check`로 검증한다.
- `npm run verify`는 스킬 검증과 기존 빌드를 함께 수행한다.
- 자동 호출은 `createtree-office-ops`, `office-drizzle-guardian`, `office-tiptap-richtext`, `office-pdca-workflow`, `office-google-workspace`, `office-pdf-contracts` 같은 프로젝트 전용 핵심 스킬만 기본값으로 둔다.
- 공통 품질 스킬은 컨텍스트와 속도 보호를 위해 `$스킬명`으로 명시 호출할 때만 사용한다.

### 자동 Skill Impact Check

기능 개발, 기존 기능 변경, 업데이트 완료 시 AI는 아래 항목을 자동 확인한다.

1. 반복 작업 규칙이나 새 사내 운영 흐름이 생겼는가?
2. API, DB, 컴포넌트, 검증 명령, 문서 위치가 바뀌었는가?
3. 기존 스킬 설명이 현재 코드와 달라졌는가?
4. 새 기능이 향후 반복 개발될 가능성이 큰가?

하나라도 해당하면 관련 스킬을 업데이트하고 `npm run skills:sync` 및 `npm run skills:check`를 실행한다.

### 사용자 확인이 필요한 운영 정책 변경

아래 변경은 AI가 자동 반영하지 않고 사용자 확인 후 스킬에 반영한다.

- 배포/인프라 기준 변경
- 운영 DB 접근 원칙 변경
- 개인정보/보안 기준 변경
- 의료광고/법무 표현 기준 변경
- AI provider/model 운영 기준 변경
- 금전/계약/영업 데이터 기준 변경
- 스킬 자동화 권한, `!!승인!!`, `!!푸시!!`, `!!테스트!!` 규칙 변경

---

## 6. 응답 규칙

### 작업 보고 시

- 모든 보고 및 계획등 은 한국어로 작성

### 작업 완료 시

- 변경된 파일 목록과 변경 내용 요약 제공
- Feature 이상의 작업은 다음 PDCA 단계 안내

### 자동 인수인계 규칙

- **코드 변경(수정/추가/삭제)이 포함된 모든 작업 완료 시, `docs/05-devlog/` 규칙에 따라 인수인계 문서를 자동 작성한다.**
  - 작업 크기(Quick Fix, Minor Change, Feature, Major Feature)를 구분하지 않고, 코드 변경이 1줄이라도 발생하면 적용
  - !!인수인계!! 키워드 없이도 자동 실행
  - 인수인계 문서 작성은 **작업의 최종 단계**(사용자에게 완료 보고 직전)에 수행한다
- **통합 규칙 (대화 단위)**
  - 같은 대화(세션) 내에서 수행한 모든 작업은 **하나의 인수인계 파일에 통합** 작성한다
  - 추가 작업이 발생하면 기존 파일을 **업데이트**(섹션 추가)하여 누적한다
  - 단, 작업 성격이 완전히 다른 경우(예: 버그 수정 vs 신규 기능)는 별도 파일로 분리 가능
- **인수인계 제목 규칙**
  - 대화 내 작업이 1건이면: 해당 작업 제목 사용
  - 대화 내 작업이 2건 이상이면: 대표 작업 또는 묶음 제목 사용 (예: `UI개선및버그수정`)
- **포함 내용 (필수)**
  - 변경 파일 목록 (경로 포함)
  - 핵심 변경 내용 (코드 diff 또는 요약)
  - 동작 확인 상태 (✅/❌)
  - 다음 작업 참고사항 (있을 경우)
- **제외 대상 (인수인계 불필요)**
  - 코드 변경 없이 질문/답변만 한 경우 (!!질문!! 등)
  - 문서만 수정한 경우 (`docs/` 내 PDCA 문서, 인수인계 문서 자체)
  - git 커밋/push만 수행한 경우

### 커뮤니케이션

- 필수 답변규칙
  - !!질문!! 이라는 키워드가 포함된 경우, 코드 수정이나 PDCA 절차 없이 질문에 대한 조사와 답변만 수행합니다.
  - !!승인!! 이라는 키워드가 포함된 경우, 터미널 권한, 코드 수정이나 PDCA 절차등을 포함한 모든 권한을 이관받아 현재 진행하려는 개발절차에 승인 절차 없이 끝까지 개발을 수행합니다.
  - !!푸시!! 이라는 키워드가 포함된 경우, 현재까지 작업한 내역을 git에 푸시합니다. 중요사항이나 설명을 커밋메세지에 포함하여 푸시합니다.
  - !!인수인계!! 이라는 키워드가 포함된 경우, 최근 개발 변경사항을 `docs/05-devlog/` 규칙에 맞게 인수인계 문서로 작성합니다. 코드 수정 없이 문서 작성만 수행합니다.
    - 범위 판단 (우선순위순):
      1. `docs/05-devlog/` 최신 파일 → 마지막 인수인계 시점 확인
      2. `git log` / `git diff` → 이후 변경된 파일과 커밋 목록 수집
      3. 현재 및 최근 대화 내역 → 변경 의도, 설계 결정, 주의사항 맥락 보충
    - 순번: 당일 기존 파일 수 + 1로 자동 결정
    - 다수 작업이 있을 경우 작업 단위별로 순번을 나누어 별도 파일로 작성
    - 단, 해당 대화에서 자동 인수인계가 이미 작성된 경우 중복 작성하지 않고, 누락된 내용만 보완한다
- 모든 개발에 있어서 개발하려는 "목정성을 명확히 파악"해서 내가 놓친부분이 있다면 아이디어를 주고 부과설명을 통해 장단점을 설명해주며, 목적성이 모호하거나 알아듣기 어려웠다면 지체없이 다시 설명하라고 질문해야해.
- 한국어 기본 (코드/기술 용어는 영어 유지)
- 간결하고 핵심적인 설명
- 초보 개발자가 이해할 수 있는 수준으로 설명
- 추측하지 않고, 불확실하면 질문

---

createTree Office PDCA 개발 시스템 v2.0 — 2026.03.22 Railway 이관 완료

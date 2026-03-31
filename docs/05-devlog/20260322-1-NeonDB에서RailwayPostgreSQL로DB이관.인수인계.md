# 20260322-1-RailwayDB이관및GEMINI업그레이드 인수인계

## 작업 개요
- **목적**: Neon DB → Railway PostgreSQL DB 완전 이관 + GEMINI.md 전면 업그레이드 + 종합명세서 v3 작성
- **결과**: DB 이관 완료(463행), 코드/문서 Neon 잔재 제거, GEMINI.md createTree 프로젝트 수준으로 업그레이드
- **참고**: createTree 메인 사이트(createAI_v1) 이관 경험 기반으로 진행

---

## 작업 1: DB 이관 (Neon → Railway PostgreSQL)

### 변경 파일
| 파일 | 변경 내용 |
|------|----------|
| `server/.env` | `DATABASE_URL`을 Railway 외부 URL로 변경. Neon URL 완전 삭제 |
| `server/src/routes/webhook.ts` | 로그 메시지 "Neon DB" → "DB" 변경 (L31) |

### 삭제 파일 (일회성 마이그레이션 도구)
| 파일 | 사유 |
|------|------|
| `server/scripts/migrate-to-railway.ts` | Neon→Railway 데이터 복사 스크립트 — 이관 완료 후 불필요 |
| `server/scripts/verify-migration.ts` | 마이그레이션 검증 스크립트 — 검증 완료 후 불필요 |

### 이관 결과
- 20개 테이블, 463/463행 전량 이관 (유실 0)
- FK CASCADE 문제 → v2 스크립트로 해결 (부모→자식 순서)
- 로컬 서버 테스트 통과 (스케줄러 19개 정상 등록)

### ✅ 완료된 작업 (환경 설정)
- **Railway 대시보드 DATABASE_URL 변경 완료** (Railway 내부망 연결)
- **GitHub develop → main PR 머지 및 자동 배포 완료**

---

## 작업 2: GEMINI.md 전면 업그레이드

### 변경 파일
| 파일 | 변경 내용 |
|------|----------|
| `GEMINI.md` | 전면 재작성 (v2.0) |

### 추가된 항목 (createTree 프로젝트에서 이식)
| 항목 | 설명 |
|------|------|
| **DB 접근 규칙** | Railway PostgreSQL + postgres.js 드라이버 스크립트 템플릿 |
| **브라우저 테스트 규칙** | localhost:5050 로그인 방식, 프로덕션 테스트 계정 |
| **PowerShell 터미널 규칙** | `&&` 금지, 한글 커밋 금지, 명령어 분리 실행 |
| **git commit 규칙** | 영문 단문 커밋, 명령어 분리 실행 |
| **모놀리식 방지 규칙** | 1000줄 제한, Layered Architecture, Custom Hook 분리 |
| **코딩 전 체크** | 유사 기능 검색 → 재사용 |
| **리팩토링 시점** | 20줄 초과, if-else 3단계, 코드 중복 |
| **!!푸시!! 커맨드** | git push 단축 키워드 |
| **Drizzle ORM 규칙 보강** | `drizzle-kit push` 필수, 트랜잭션 롤백 |

### 수정된 항목
- 기술 스택 DB: `Neon DB` → `Railway`
- 배포 환경: `미정` → `Railway (Production)`
- DB Driver: `postgres` (postgres.js) + `drizzle-orm/postgres-js` 명시
- 주요 디렉토리: `server/src/db/` 명시

### 유지된 항목 (Office 고유)
- 4.5 아키텍처 규칙 (탭 분리, 중앙 모달, UI/UX 통일)
- RBAC (사내 직원 전용)

---

## 작업 3: Neon 잔재 제거

### 수정된 파일
| 파일 | Neon 참조 | 처리 |
|------|----------|------|
| `GEMINI.md` | `Neon DB + Drizzle ORM` | → `Railway + Drizzle ORM` |
| `README.md` | `Neon DB + Drizzle ORM` | → `Railway + Drizzle ORM` |
| `server/.env` | Neon URL 주석 백업 | → 완전 삭제 |

### 수정하지 않은 파일 (역사적 기록 보존)
- `docs/01-plan/` — 초기 계획 문서 (당시 Neon 사용)
- `docs/02-design/` — 설계 문서 (당시 Neon 기준)
- `docs/03-analysis/` — 분석 보고서
- `docs/04-report/` — 완료 보고서
- `docs/05-devlog/` — 이관 인수인계 (이관 과정 기록)
- `docs/0-종합명세서/01, 02` — 이전 버전 (03이 최신)

### 결론
- **활성 코드 (*.ts, *.tsx)**: Neon 참조 **0건** ✅
- **활성 지침 (GEMINI.md, README.md)**: Neon 참조 **0건** ✅
- **환경변수 (.env)**: Neon URL **완전 삭제** ✅
- **과거 PDCA 문서**: 역사적 기록으로 **의도적 보존**

---

## 작업 4: 종합명세서 v3 작성

### 신규 파일
| 파일 | 내용 |
|------|------|
| `docs/0-종합명세서/03-20260322-종합명세서.md` | Railway PostgreSQL 이관 반영, 20개 테이블 현행 데이터 규모, 서비스 상품/견적서/계약서 시스템 추가, 최신 파일 구조 |

### v3에서 추가된 내용
- Railway DB 이관 히스토리 (Before/After 비교표)
- 서비스 상품 테이블 4개 추가 (services, service_tiers, service_items, service_item_prices)
- 견적서 테이블 3개 추가 (quotations, quotation_items, quotation_service_configs)
- 계약서 테이블 1개 추가 (contracts)
- 할인 정책 테이블 1개 추가 (contract_discount_policies)
- 각 테이블의 실제 행 수 (03-22 기준)
- Railway 환경변수 설정 가이드

---

## 동작 확인 상태
- ✅ Railway DB 스키마 push 완료
- ✅ 데이터 마이그레이션 463/463행 전량 복사
- ✅ 로컬 서버 Railway DB로 정상 기동
- ✅ 코드 내 Neon 잔여 참조 완전 제거
- ✅ GEMINI.md v2.0 업그레이드 완료
- ✅ README.md 현행화 완료
- ✅ 종합명세서 v3 작성 완료
- ✅ git commit & push (develop: `7aa5a44`)
- ✅ **Railway 대시보드에서 DATABASE_URL 변경 완료** (Railway 내부망 연결)
- ✅ **GitHub PR (develop → main) 머지 및 자동 배포 완료**

## 다음 작업 참고사항
1. **프로덕션 사이트** 로그인/기능 테스트
2. **Neon DB 해지** 검토 (createTree 메인과 오피스 모두 Railway 이관 완료 시)

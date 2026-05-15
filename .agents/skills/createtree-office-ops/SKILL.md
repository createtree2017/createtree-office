---
name: createtree-office-ops
description: "CT_office 사내 운영 포털 전용 스킬. Use for createTree Office work: manuals, tasks, clients, market research, sales CRM, monitoring, service products, quotations, contracts, employee portal, RBAC, React/Vite frontend, Express backend, Railway PostgreSQL, and office workflow changes."
---

# createTree Office 운영 스킬

## 핵심 기준

이 프로젝트는 사내 인수인계 매뉴얼, 업무 관리, 거래처 관리, 시장조사/영업관리, 견적/계약, 온라인 평판 모니터링을 다루는 직원 전용 포털이다. 기능 변경 시 거래처, 영업선택업체, 권한, 문서, 계약 데이터의 연결을 함께 확인한다.

## 작업 전 확인

- `GEMINI.md`, 최신 `docs/05-devlog/`, 관련 `docs/0-종합명세서/`를 확인한다.
- 실제 동작 기준은 코드이며, 문서가 오래됐으면 스킬 또는 문서 보강 필요성을 남긴다.
- 기능 추가나 큰 변경은 PDCA 문서 필요 여부를 먼저 판단한다.

## 구현 규칙

- React, TypeScript, Vite, TanStack Query, Express, Drizzle, Railway PostgreSQL 구조를 유지한다.
- 업무/거래처/시장조사/영업관리/견적/계약/모니터링은 독립 도메인으로 보고 route, hook, page를 무리하게 합치지 않는다.
- 시장조사 원본(`market_research_items`)과 영업선택업체(`sales_leads`)는 분리 보존한다. 기존 거래처(`clients`)는 운영/계약 거래처로 유지하고 영업 확정 시 연결한다.
- 분만병원 시장조사는 HIRA 산부인과 진료과목 보유기관 전체를 원본 보존하고, HIRA 의료기관별상세정보서비스의 진료과/전문의 수로 1차 후보를 좁힌 뒤 필요한 후보만 의료장비를 조회해 `산부인과 전문의 3명 이상`, `소아청소년과`, `인큐베이터`, `분만감시기` 4개 조건 중 3개 이상을 분만산부인과 후보로 판정한다. 네이버 지역검색은 확정 후보에 대해서만 카테고리(`병원,의원>산부인과`)와 플레이스 URL 보강용으로 호출하며, 네이버 실패는 후보 제외 사유가 아니다. 네이버 호출은 limit/delay/retry/backoff로 429를 완화하고, Google Places는 기본 흐름에서 제외한다.
- 시장조사 실행은 관리자 로컬 서버에서만 수행하는 운영을 기본으로 한다. 배포 서버는 `MARKET_RESEARCH_RUN_ENABLED=false` 또는 production 기본값으로 `POST /api/market-research/runs`만 차단하고, 기존 조사 결과 조회/수정/엑셀/영업관리 이동은 계속 허용한다.
- 시장조사 결과 화면은 성능 보호와 영업 우선순위를 위해 기본적으로 `분만산부인과` 후보를 페이지 단위로 조회한다. 1차 필터는 `분만산부인과`, `일반산부인과`, `산후조리원`, `상세조사후보`, `전체원본`으로 단순화한다. 전체 원본은 사용자가 `전체원본` 보기를 선택했을 때만 조회한다.
- RBAC와 직원 전용 인증 흐름을 우선 확인한다.
- `!!푸시!!` 없이 `git add`, `git commit`, `git push`를 실행하지 않는다.
- 모든 개발 변경사항은 기본적으로 `develop` 브랜치에서 작업하고, `!!푸시!!` 요청 시 `origin/develop`에 푸시한다.
- 사용자가 명시적으로 별도 브랜치/PR 전략을 요청한 경우에만 `codex/*` 작업 브랜치를 새로 만든다.

## Skill Impact Check

기능 개발, 기존 기능 변경, 업데이트 완료 시 다음을 자동 확인한다.

- 반복 작업 규칙이나 새 운영 흐름이 생겼는가?
- API, DB, 컴포넌트, 검증 명령, 문서 위치가 바뀌었는가?
- 기존 스킬 설명이 현재 코드와 달라졌는가?
- 새 기능이 향후 반복 개발될 가능성이 큰가?

해당하면 관련 스킬과 `.agents/skills/SKILLS_INDEX.md`를 업데이트한다. 배포/DB/보안/개인정보/계약·금전/자동화 권한 정책 변경은 사용자 확인 후 반영한다.

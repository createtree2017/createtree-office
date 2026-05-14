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
- RBAC와 직원 전용 인증 흐름을 우선 확인한다.
- `!!푸시!!` 없이 `git add`, `git commit`, `git push`를 실행하지 않는다.

## Skill Impact Check

기능 개발, 기존 기능 변경, 업데이트 완료 시 다음을 자동 확인한다.

- 반복 작업 규칙이나 새 운영 흐름이 생겼는가?
- API, DB, 컴포넌트, 검증 명령, 문서 위치가 바뀌었는가?
- 기존 스킬 설명이 현재 코드와 달라졌는가?
- 새 기능이 향후 반복 개발될 가능성이 큰가?

해당하면 관련 스킬과 `.agents/skills/SKILLS_INDEX.md`를 업데이트한다. 배포/DB/보안/개인정보/계약·금전/자동화 권한 정책 변경은 사용자 확인 후 반영한다.

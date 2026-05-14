---
name: office-drizzle-guardian
description: "CT_office Drizzle and Railway PostgreSQL guardian skill. Use for schema changes, migrations, server/src/db/schema.ts updates, Railway DB push decisions, DB scripts, query fixes, and production data safety."
---

# Office Drizzle Guardian

## 핵심 기준

`server/src/db/schema.ts` 변경은 운영 500 에러로 이어질 수 있다. schema, migration, API 타입, 프론트 사용처를 함께 확인한다.

## 작업 전 확인

- `server/src/db/schema.ts`, drizzle config, 관련 route/service, 최신 DB 인수인계 문서를 확인한다.
- 운영 DB 직접 수정, migration 적용 방식 변경, Postgres MCP 상시 활성화는 사용자 확인 후 반영한다.

## 구현 규칙

- DB 작업은 `server/scripts/`의 파일 기반 스크립트 패턴을 우선한다.
- `npx tsx -e` 인라인 스크립트는 사용하지 않는다.
- schema 변경 시 `drizzle-kit push` 필요 여부와 적용 대상 DB를 명확히 보고한다.
- 대량 UPDATE/DELETE, DROP/TRUNCATE, production migration은 별도 확인 없이 실행하지 않는다.

## 검증

- 가능한 범위에서 타입체크, API 호출, migration review를 수행한다.
- 스킬 내용 변경 후 `npm run skills:sync`와 `npm run skills:check`를 실행한다.

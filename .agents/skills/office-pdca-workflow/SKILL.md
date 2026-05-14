---
name: office-pdca-workflow
description: "CT_office PDCA workflow skill. Use for Plan, Design, Check, Report, devlog handoff documents, work classification, feature planning, implementation completion reports, and keeping GEMINI.md documentation rules consistent."
---

# Office PDCA Workflow

## 핵심 기준

CT_office는 PDCA 문서를 개발 이력과 인수인계의 기준으로 사용한다. 기능 규모와 위험도에 맞게 Plan, Design, Check, Report, devlog를 선택한다.

## 작업 분류

- Quick Fix: 작은 버그나 오타 수정
- Minor Change: 작은 개선 또는 단일 흐름 수정
- Feature: 새 기능이나 여러 파일에 걸친 변경
- Major Feature: DB/API 계약, 아키텍처, 대형 리팩토링, 운영 정책 변경

## 구현 규칙

- Feature 이상은 관련 Plan/Design 존재 여부를 확인한다.
- 코드 변경이 포함되면 작업 완료 전에 `docs/05-devlog/` 인수인계 필요 여부를 확인한다.
- 문서만 수정한 작업은 코드 인수인계 규칙과 구분한다.
- 날짜/파일명 규칙은 `GEMINI.md`를 따른다.

## Skill Impact Check

PDCA 저장 위치, 상태값, 검증 명령, 인수인계 형식이 바뀌면 이 스킬과 `SKILLS_INDEX.md`를 업데이트한다.

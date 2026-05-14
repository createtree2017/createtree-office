---
name: office-tiptap-richtext
description: "CT_office Tiptap rich-text safety skill. Use for manual editor work, Tiptap JSON/HTML conversion, rich text persistence, editor rendering bugs, content migration, and preventing manual body data wipe or malformed document structures."
---

# Office Tiptap Rich Text

## 핵심 기준

매뉴얼 본문은 Tiptap 기반 리치 텍스트 데이터다. 저장 포맷을 추측하거나 HTML/JSON을 임의 변환하면 본문이 깨질 수 있으므로 기존 저장 구조를 먼저 확인한다.

## 작업 전 확인

- 매뉴얼 editor 컴포넌트, 저장 API, DB 컬럼 타입, 기존 데이터 예시를 확인한다.
- HTML, JSON, plain text 중 어떤 형태를 저장하는지 코드 기준으로 판단한다.

## 구현 규칙

- 기존 Tiptap document 구조를 보존한다.
- 빈 문자열, 잘못된 JSON, partial document를 저장하지 않도록 validation을 둔다.
- 본문 migration은 샘플 데이터 백업과 readback 확인 전까지 실행하지 않는다.
- editor UI 변경 시 저장/불러오기/미리보기/수정 취소 흐름을 함께 확인한다.

## 검증

- 기존 문서 열기, 수정 저장, 새로고침 후 재조회, 빈 본문 방지 시나리오를 확인한다.
- 스킬 변경 후 `npm run skills:sync`와 `npm run skills:check`를 실행한다.

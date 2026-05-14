---
name: office-pdf-contracts
description: "CT_office quotation, contract, and PDF workflow skill. Use for service products, quotation wizard, contract conversion, VAT/discount calculations, PDF download/generation, contract status changes, renewal, and my-page contract visibility."
---

# Office PDF Contracts

## 핵심 기준

견적서와 계약서는 금액, 부가세, 할인, 계약 상태, 거래처 활성 서비스와 연결된다. UI 변경만 하더라도 계산/상태/API 흐름을 함께 확인한다.

## 작업 전 확인

- 서비스 상품 마스터, 견적서, 계약서 route/page/hook/schema를 확인한다.
- 금액 단위, VAT 표시 방식, 계약기간 할인 정책, 상태 전이를 확인한다.
- PDF 생성 방식이 클라이언트 `html2pdf.js`인지 서버 Playwright PDF인지 코드 기준으로 판단한다.

## 구현 규칙

- 견적서 수락, 계약 변환, 활성화, 해지, 갱신 흐름의 자동 동작을 유지한다.
- 계약 해지 시 다른 활성 계약 존재 여부를 확인한다.
- PDF는 A4, 여백, 파일명, 출력 대상 DOM이 깨지지 않게 한다.
- 금액/계약 정책 변경은 운영 정책 변경으로 보고 사용자 확인 후 반영한다.

## 검증

- 신규 견적, 수정, 상태 변경, 계약 전환, PDF 다운로드, 마이페이지 표시를 확인한다.
- 스킬 변경 후 `npm run skills:sync`와 `npm run skills:check`를 실행한다.

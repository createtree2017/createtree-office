---
name: office-google-workspace
description: "CT_office Google Workspace integration skill. Use for Google Drive, Resend sales mail, Forms, Calendar, shared drive permissions, service account behavior, file upload/search, sales material sending, workspace API docs, and client document library workflows."
---

# Office Google Workspace

## 핵심 기준

CT_office는 Google Drive 자료실, 영업메일 발송, Google Workspace API를 업무 포털에 연결한다. 권한, 공유 드라이브, 서비스 계정, 거래처별 접근 범위, 영업자료 발송 차단 조건을 먼저 확인한다.

## 작업 전 확인

- Drive/메일/Forms/Calendar 관련 route, service, hook, page를 확인한다.
- 서비스 계정 credential 파일과 `.env` 값은 노출하지 않는다.
- Google API 정책이나 scope가 필요하면 공식 Google 문서를 확인한다.

## 구현 규칙

- 거래처별 권한 분리를 유지한다.
- Shared Drive 사용 시 `supportsAllDrives`, `driveId` 등 기존 패턴을 확인한다.
- 파일 업로드, 검색, 폴더 탐색은 TanStack Query cache key와 권한 에러 처리를 함께 확인한다.
- Calendar/Forms 확장은 기존 Drive 인증 구조와 충돌하지 않게 설계한다.
- 영업메일 발송은 기본적으로 Railway SMTP 차단을 피하기 위해 Resend HTTP API를 사용한다.
- Resend 발송은 `RESEND_API_KEY`, `EMAIL_FROM`이 없으면 실제 발송하지 않고 초안/차단 로그만 저장한다.
- 수신거부, 폐업, 이메일 없음 업체에는 영업자료를 실제 발송하지 않는다.

## 검증

- 권한 있는 사용자, 권한 없는 사용자, 폴더 이동, 검색, 업로드 실패 상태를 확인한다.
- 스킬 변경 후 `npm run skills:sync`와 `npm run skills:check`를 실행한다.

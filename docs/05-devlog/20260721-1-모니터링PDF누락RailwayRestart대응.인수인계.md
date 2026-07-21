# 20260721-1-모니터링PDF누락RailwayRestart대응.인수인계

## 1. 작업 개요

- 작업일: 2026-07-21
- 분류: 운영 장애 대응 기록
- 대상 기능: 모니터링 시스템 PDF 보고서 다운로드 및 Telegram 보고서 첨부 발송
- 증상: 모니터링 수집/분석과 HTML 보고서는 정상이나, Telegram에는 텍스트 메시지만 오고 PDF 보고서가 누락됨

## 2. 확인된 증상

- 모니터링 결과 목록에는 `완료` 상태로 표시됨
- 보라색 `보고서` 버튼의 HTML 보고서는 정상 표시됨
- 빨간색 `PDF` 버튼 클릭 시 `PDF 생성 실패` 토스트 표시
- 브라우저 콘솔에서 `/api/monitoring/results/{id}/pdf` 요청이 500 오류 발생
- Railway 로그에서 아래 유형의 오류 확인

```text
PDF 생성 실패 (텍스트 알림으로 대체)
PDF 다운로드 오류
browserType.launch: Failed to launch
Error: spawn /root/.cache/ms-playwright/.../chrome-headless-shell EAGAIN
```

## 3. 원인 판단

- Telegram 자체 문제는 아님
  - Telegram 텍스트 알림은 정상 발송됨
  - PDF 생성 실패 시 코드가 텍스트 알림으로 대체 발송하도록 되어 있음
- HTML 보고서와 PDF 보고서는 생성 경로가 다름
  - HTML 보고서: `generateHtml()` 사용, Playwright/Chromium 실행 없음
  - PDF 보고서: `generatePdf()` 사용, Railway 서버에서 Playwright Chromium 실행 필요
- 현재 장애는 Railway 앱 서버에서 Playwright Chromium 프로세스가 정상 실행되지 않아 PDF 생성이 실패한 상태로 판단됨

## 4. 즉시 해결 방법

Railway에서 앱 서버 서비스를 Restart한다.

1. Railway 프로젝트 접속
2. `production` 환경 선택
3. 서비스 카드 중 `createtree-office` 선택
   - `Postgres`가 아니라 앱 서버 서비스
4. 오른쪽 최신 Deployment 패널 상단의 `...` 메뉴 클릭
5. `Restart` 클릭
6. `Restart successful` 표시 확인
7. createTree Office에서 모니터링 결과의 빨간색 `PDF` 버튼 재테스트
8. 수동 모니터링 1건 실행 후 Telegram에 PDF 보고서가 첨부되는지 확인

## 5. 2026-07-21 조치 결과

- Railway `createtree-office` 서비스 Restart 수행
- `Restart successful` 확인
- 모니터링 결과 PDF 다운로드 정상화 확인
- 수동 모니터링 실행 후 Telegram PDF 보고서 첨부 발송 정상화 확인

## 6. 재발 시 확인 순서

1. 모니터링 결과에서 보라색 `보고서` 버튼이 열리는지 확인
2. 빨간색 `PDF` 버튼이 다운로드되는지 확인
3. PDF 버튼이 실패하면 Railway 로그에서 아래 키워드 검색

```text
PDF 생성 실패
PDF 다운로드 오류
browserType.launch
chrome-headless-shell
EAGAIN
```

4. 동일 오류가 있으면 `createtree-office` 서비스 Restart
5. Restart 후 PDF 버튼과 Telegram 보고서 발송 재확인

## 7. 운영 참고사항

- 주기적으로 서버를 재시작하는 것은 임시 운영 대응으로는 가능하지만, 근본 해결책은 아님
- 같은 증상이 반복되면 아래 개선 작업을 검토해야 함
  - PDF 생성 작업 큐 적용
  - Playwright Chromium 동시 실행 제한
  - PDF 생성 실패 시 재시도 로직 추가
  - 장시간 운영 후 Chromium 프로세스/임시 디렉토리 정리 상태 점검
  - Railway 리소스 사용량과 11시 전후 스케줄 집중 여부 확인
- 2026-07-21 기준 모든 모니터링 스케줄은 중복 없이 2분 간격으로 분산 배치함

## 8. 주의사항

- `Postgres` 서비스는 재시작하지 않는다
- Railway의 `Delete Service` 또는 `Remove`는 절대 클릭하지 않는다
- 코드 수정 없이 단순 복구가 목적이면 Git push는 필요 없다
- `Restart`가 없거나 실패할 때만 `Redeploy`를 대안으로 검토한다

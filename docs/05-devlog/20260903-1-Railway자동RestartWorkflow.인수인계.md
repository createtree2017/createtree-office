# 20260903-1-Railway 자동 Restart Workflow 인수인계

## 작업 개요

- 작업일: 2026-09-03
- 분류: 운영 자동화 / 장애 재발 방지
- 대상: Railway `createtree-office` 앱 서비스, GitHub Actions
- 관련 증상: Telegram 메시지는 전송되지만 PDF 보고서 첨부가 누락되는 문제

Telegram 보고서 누락 증상은 수동 Railway Restart 이후 다시 정상 동작하는 것으로 확인되었다. 매번 Railway 콘솔에서 수동으로 재시작하지 않도록 GitHub Actions 기반 자동 Restart workflow를 `main` 브랜치에 추가했다.

## 확인한 내용

- 기존 인수인계 문서 `docs/05-devlog/20260721-1-모니터링PDF누락RailwayRestart대응.인수인계.md` 기준, 동일 증상은 Railway `createtree-office` 앱 서비스 Restart로 즉시 복구된 이력이 있다.
- 재시작 대상은 Postgres가 아니라 앱 서비스 `createtree-office`다.
- Railway Project Token은 기존에 생성된 토큰이 없는 상태였고, 사용자가 `production` 환경용 토큰을 생성했다.
- GitHub 저장소 `createtree2017/createtree-office`의 `Settings > Secrets and variables > Actions`에 Repository Secret `RAILWAY_TOKEN`이 등록된 것을 확인했다.
- GitHub Actions 스케줄 workflow는 기본 브랜치에서 동작해야 하므로, 자동 Restart workflow는 `main` 브랜치에 반영했다.

## 변경 내용

`main` 브랜치에 다음 workflow를 추가했다.

- 파일: `.github/workflows/restart-railway-office.yml`
- Workflow 이름: `Restart Railway Office Service`
- 자동 실행: 매일 08:30 KST
- GitHub cron: `30 23 * * *`
- 수동 실행: `workflow_dispatch` 지원
- 실행 명령:

```bash
npx -y @railway/cli@latest restart \
  --service createtree-office \
  --environment production \
  --yes \
  --json
```

- Restart 이후 20초 대기 후 헬스체크:

```bash
curl --fail --show-error --silent --max-time 30 \
  https://createtree-office-production.up.railway.app/api/health
```

## Git 반영 내역

- 반영 브랜치: `main`
- 커밋: `3a136d7 chore: schedule railway service restart`
- 푸시 대상: `origin/main`
- 푸시 결과: 정상 반영 확인
- 작업 후 로컬 브랜치: `develop`으로 복귀

## 검증

- `git diff --check`: 통과
- `npx -y prettier --check .github/workflows/restart-railway-office.yml`: 통과
- `git push origin main`: 성공
- `git ls-remote origin main`: 원격 `main`이 `3a136d7` 커밋을 가리키는 것 확인
- 사용자가 Railway 수동 재배포/Restart 이후 Telegram PDF 보고서가 다시 정상 수신되는 것을 확인했다.

## 운영 방법

자동 Restart는 매일 오전 8시 30분(KST)에 실행된다.

수동으로 즉시 확인하려면 GitHub에서 다음 경로로 이동한다.

1. `createtree2017/createtree-office` 저장소
2. `Actions`
3. `Restart Railway Office Service`
4. `Run workflow`

수동 실행 후 성공하면 Railway `createtree-office` 서비스가 Restart되고 `/api/health` 확인까지 통과한 것이다.

## 주의 사항

- 이 workflow는 앱 서비스를 재시작하는 운영 완화책이다. PDF 누락의 근본 원인은 Railway 환경에서 Playwright/Chromium 리소스 또는 프로세스 상태가 누적되어 PDF 생성이 실패하는 쪽으로 추정된다.
- 동일 증상이 반복되면 PDF 생성 큐, 동시 실행 제한, 브라우저 프로세스 정리, 재시도 로직을 별도로 구현해야 한다.
- Postgres는 정상 Online 상태였으므로 이 문제 해결을 위해 Postgres를 재시작하지 않는다.
- Railway Token 값이 화면 캡처로 노출된 이력이 있으므로, workflow 동작 확인 후 Railway 토큰을 새로 발급하고 GitHub Secret `RAILWAY_TOKEN`을 교체하는 것이 안전하다.
- 만약 Actions에서 Railway 인증 오류가 발생하면 Railway Project Token 권한 범위를 먼저 확인하고, 필요 시 더 넓은 권한의 Railway Account/Workspace Token으로 교체한다.

## 현재 상태

- 서비스는 수동 Restart 이후 정상 보고서 수신까지 확인된 상태다.
- 자동 Restart workflow는 `origin/main`에 반영 완료됐다.
- 이 인수인계 문서는 현재 로컬 `develop` 브랜치에 작성했다.

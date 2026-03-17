# 구글 플레이스 리뷰 수집 — Google Places API 전환 리포트

> **작성일**: 2026-03-16  
> **수정 파일**: `googlePlaceCollector.ts`, `monitoringService.ts`, `tasks.ts`, `drive.ts`, `client.ts`, `.env`  
> **상태**: ✅ 전환 완료 (Google Places API 기본 + Outscraper 폴백)

---

## 1. 문제 현상

Outscraper API를 통한 구글 플레이스 리뷰 수집이 **2026-03-16부터 갑자기 실패**. 모든 요청이 30초 이상 타임아웃 발생.

- 3/15까지는 정상 작동 (사용 내역 10으로 기록됨, 2시간 후 결과 만료)
- 3/16 크레딧 $0 확인 → $50 충전 후에도 동일 증상
- Outscraper 웹사이트 직접 실행 시 즉시 결과 반환 (API만 안 됨)
- Outscraper 공식 Service Status: "Task Execution Delays" 장애 공지 (3/7 생성, 3/11 최종 업데이트)

---

## 2. 원인 분석

### Outscraper API 호출 결과 (3가지 URL 조합 테스트)

| 테스트 | URL                      | 엔드포인트             | 결과             |
| ------ | ------------------------ | ---------------------- | ---------------- |
| A      | `api.app.outscraper.com` | `/maps/reviews-v3`     | ❌ 30초 타임아웃 |
| B      | `api.outscraper.cloud`   | `/maps/reviews-v3`     | ❌ 30초 타임아웃 |
| C      | `api.outscraper.cloud`   | `/google-maps-reviews` | ❌ 30초 타임아웃 |

### 결론

- **URL이나 엔드포인트 문제가 아님** — 3가지 조합 모두 실패
- **Outscraper 서버 측 API 처리 큐 장애** — 웹사이트와 API가 서로 다른 내부 처리 경로 사용
- **우리 코드 문제가 아님** — 3/15까지 동일 코드로 정상 작동

---

## 3. 해결 방향 결정

### 대안 비교

| 방식                         | 장점                            | 단점                                |
| ---------------------------- | ------------------------------- | ----------------------------------- |
| Outscraper (현재)            | 대량 수집 가능                  | ❌ 외부 서비스 장애에 무방비        |
| 자체 크롤링 (Puppeteer)      | 외부 의존 없음                  | ❌ 구글 봇 감지 강력, 유지보수 부담 |
| **Google Places API (공식)** | **안정적, 월 $200 무료 크레딧** | 리뷰 최대 5개                       |

### 결정 배경

- 리뷰 5개면 일상 모니터링에 충분 (사용자 확인)
- 100업체 × 매일 1회 = 월 ~$51 → **$200 무료 크레딧 내 해결**
- GCP 계정 이미 보유 (Google Drive 연동에 사용 중)
- `.env`에 `GOOGLE_PLACES_API_KEY` 이미 설정됨
- **Outscraper 코드는 삭제하지 않고 보존** (향후 대량 분석용)

---

## 4. 변경 내용

### 4.1 `googlePlaceCollector.ts` — 전면 재작성

**구조 변경**:

```
기존: crawlGooglePlace() → Outscraper API only
변경: crawlGooglePlace() → Google Places API (기본)
                         ↘ 실패 시 crawlGooglePlaceOutscraper() (폴백)
```

**Google Places API 수집 흐름**:

```
1. findPlaceId()  → Text Search (New API) → Place ID 확보
2. getPlaceReviews() → Place Details (Legacy API, reviews_sort=newest) → 리뷰 5개
3. convertGoogleReviews() → PostData[] 변환
```

- **장소 검색**: New API 사용 (`places.googleapis.com/v1/places:searchText`)
- **리뷰 조회**: Legacy API 사용 (`maps.googleapis.com/maps/api/place/details/json`) — `reviews_sort=newest` 지원을 위해 Legacy 선택
- **원문 우선**: `r.text` (Legacy는 한국어 원문 반환) 우선 사용
- **날짜 변환**: `r.time` (Unix timestamp) → ISO 8601 변환

**Outscraper 코드 보존**:

- 기존 `crawlGooglePlace()` → `crawlGooglePlaceOutscraper()`로 이름 변경
- Outscraper 관련 메서드 (`submitAsyncRequest`, `pollForResults`, `parseOutscraperData`) 전체 보존
- Google Places API 실패 시 자동으로 Outscraper 폴백 호출

### 4.2 `monitoringService.ts` — 로그 메시지 갱신 (2줄)

```diff
- // 구글 플레이스 — Outscraper API (안정적, 봇 감지 없음)
+ // 구글 플레이스 — Google Places API (공식, 실패 시 Outscraper 폴백)
- console.log(`🔍 구글 플레이스 수집 (Outscraper): ${googleQuery}`);
+ console.log(`🔍 구글 플레이스 수집 (Google Places API): ${googleQuery}`);
```

### 4.3 하드코딩 제거 (3파일)

| 파일        | 변경 전                                                    | 변경 후   |
| ----------- | ---------------------------------------------------------- | --------- |
| `tasks.ts`  | `GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID \|\| '1G-Wyp42A3...'` | `\|\| ''` |
| `drive.ts`  | `GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID \|\| '1SI_8POn6S...'` | `\|\| ''` |
| `client.ts` | `GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID \|\| '1SI_8POn6S...'` | `\|\| ''` |
| `tasks.ts`  | `GOOGLE_SHARED_DRIVE_ID \|\| '0AGA9ZFf...'`                | `\|\| ''` |

### 4.4 환경변수 정리

**로컬 `.env` 추가**:

```
GOOGLE_SHARED_DRIVE_ID=0AGA9ZFf_x1KWUk9PVA
```

**Railway 배포 환경에 추가**:

```
GOOGLE_PLACES_API_KEY=AIzaSyDRfBdbozLxNUePywlv3EEGCtDmjEK-Pg4
GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID=1G-Wyp42A3OzmwxadzXsiyLIN_TrOFtYz
GOOGLE_SHARED_DRIVE_ID=0AGA9ZFf_x1KWUk9PVA
```

---

## 5. 테스트 결과

### Google Places API 직접 테스트

```
📍 장소 발견: 포유문산부인과 (Place ID: ChIJh7blD4WlfDURd3MSFdzSLss)
✅ 리뷰 5개 즉시 수신 (1초 미만)

리뷰 1: 신정화 ⭐5 — 2026-02-24
리뷰 2: 남혜지 ⭐5 — 2026-02-07
리뷰 3: 김수연 ⭐5 — 2025-11-06
리뷰 4: 박지선 ⭐5 — 2026-02-24
리뷰 5: 경예슬 ⭐5 — 2026-03-06
```

### 실제 모니터링 파이프라인 실행

```
🏥 플레이스 모니터링 시작 - 포유문_구글_리뷰
🔗 구글맵 URL에서 장소명 추출: "포유문산부인과"
🔍 구글 플레이스 수집 (Google Places API): 포유문산부인과
📍 장소 발견: 포유문산부인과 (Place ID: ChIJh7blD4WlfDURd3MSFdzSLss)
📝 Google Places API: 포유문산부인과 — 5개 리뷰
✅ googleplace 리뷰 5개 수집
🤖 AI 분석 시작
✅ Gemini 종합 분석 완료
📄 보고서 드라이브 업로드 완료
🎉 모니터링 완료 - 포유문_구글_리뷰 (15530ms)
```

---

## 6. New API vs Legacy API 선택 이유

| 기능             | New API (`places.googleapis.com/v1`) | Legacy API (`maps.googleapis.com/maps/api`) |
| ---------------- | ------------------------------------ | ------------------------------------------- |
| 장소 검색        | ✅ 사용                              | -                                           |
| 리뷰 조회        | -                                    | ✅ 사용                                     |
| 리뷰 최신순 정렬 | ❌ 미지원                            | ✅ `reviews_sort=newest`                    |
| 리뷰 한국어 원문 | 번역본 기본 (`text.text`)            | ✅ 한국어 원문 (`text`)                     |
| 공식 지원        | 현재 주력                            | 계속 유지 (deprecated 아님)                 |
| 동일 API 키      | ✅                                   | ✅                                          |
| 동일 과금        | ✅                                   | ✅                                          |

---

## 7. 비용 구조

| 규모           | 일일 요청 | 월간 요청 | 월 비용 | $200 무료 크레딧 |
| -------------- | --------- | --------- | ------- | ---------------- |
| 현재 (4업체)   | 4건       | ~120건    | ~$2     | ✅ 충분          |
| 중간 (10업체)  | 10건      | ~300건    | ~$5     | ✅ 충분          |
| 목표 (100업체) | 100건     | ~3,000건  | ~$51    | ✅ 충분          |

---

## 8. 향후 참고사항

| #   | 항목                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Outscraper $50 크레딧**: 장애 해결 후 대량 수집(월간 심층 분석)에 활용 가능. `crawlGooglePlaceOutscraper()` 메서드로 직접 호출 가능 |
| 2   | **Outscraper 서비스 상태**: `outscraper.com` 상단 "Service Status" → "All Systems Operational + Active incidents" 확인                |
| 3   | **리뷰 5개 제한**: Google Places API 공식 제한. 더 많은 리뷰가 필요하면 Outscraper 활용                                               |
| 4   | **Legacy API 지속성**: Google이 Legacy API를 deprecated하지 않는 한 계속 사용 가능. New API가 정렬을 지원하면 전환 고려               |
| 5   | **Railway 환경변수 동기화**: 로컬 `.env`에 변수 추가 시 Railway Variables에도 반드시 반영 필요                                        |

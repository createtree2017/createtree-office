import axios from "axios";
import type { PostData } from "./types.js";

// ===== Google Places API (공식 — 기본) =====
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const PLACES_API_BASE = "https://places.googleapis.com/v1";

// ===== Outscraper API (대량 수집용 — 보조) =====
const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || "";
const OUTSCRAPER_API_BASE = "https://api.app.outscraper.com";
const POLL_INTERVAL_MS = 15000;
const MAX_POLL_ATTEMPTS = 20;

/**
 * 구글 플레이스 리뷰 수집기
 * 
 * 기본: Google Places API (공식, 안정적, 최대 5개 리뷰)
 * 보조: Outscraper SaaS API (대량 수집용, 유지)
 */
export class GooglePlaceCollector {

    // ================================================================
    //  ★ 기본 수집 — Google Places API (공식)
    // ================================================================

    /**
     * 구글 리뷰 수집 (기본 진입점)
     * Google Places API를 사용하여 최신 리뷰 최대 5개 수집
     */
    async crawlGooglePlace(query: string, maxReviews: number = 5): Promise<PostData[]> {
        console.log(`🔍 구글 플레이스 리뷰 수집 (Google Places API): query=${query}, max=${maxReviews}`);

        if (!GOOGLE_PLACES_API_KEY) {
            console.error("❌ GOOGLE_PLACES_API_KEY가 설정되지 않았습니다.");
            // fallback: Outscraper 시도
            console.log("🔄 Outscraper API로 폴백 시도...");
            return this.crawlGooglePlaceOutscraper(query, maxReviews);
        }

        try {
            // Step 1: 장소 검색 → Place ID 확보
            const placeId = await this.findPlaceId(query);
            if (!placeId) {
                console.warn("⚠️ Google Places API에서 장소를 찾지 못했습니다. Outscraper로 폴백...");
                return this.crawlGooglePlaceOutscraper(query, maxReviews);
            }

            // Step 2: Place Details에서 리뷰 가져오기
            const reviews = await this.getPlaceReviews(placeId);
            if (!reviews || reviews.length === 0) {
                console.warn("⚠️ Google Places API에서 리뷰가 없습니다.");
                return [];
            }

            // Step 3: PostData 형태로 변환
            return this.convertGoogleReviews(reviews, query, placeId, maxReviews);

        } catch (error: any) {
            console.error(`❌ Google Places API 실패: ${error.message}`);
            // fallback: Outscraper
            console.log("🔄 Outscraper API로 폴백 시도...");
            return this.crawlGooglePlaceOutscraper(query, maxReviews);
        }
    }

    /**
     * Step 1: 장소명/주소로 Place ID 검색
     * Text Search (New) API 사용
     */
    private async findPlaceId(query: string): Promise<string | null> {
        try {
            // Place ID가 이미 있는 경우 (place_id:ChIJ... 형태)
            if (query.startsWith("place_id:")) {
                const id = query.replace("place_id:", "");
                console.log(`📍 Place ID 직접 사용: ${id}`);
                return id;
            }

            console.log(`🔎 Google Places API: 장소 검색 중... (${query})`);
            const response = await axios.post(
                `${PLACES_API_BASE}/places:searchText`,
                {
                    textQuery: query,
                    languageCode: "ko",
                    maxResultCount: 1,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
                    },
                    timeout: 10000,
                }
            );

            const places = response.data?.places;
            if (!places || places.length === 0) {
                console.warn(`⚠️ "${query}"에 대한 검색 결과 없음`);
                return null;
            }

            const place = places[0];
            const placeId = place.id; // "places/ChIJ..." 형태가 아닌 "ChIJ..." 형태
            const displayName = place.displayName?.text || query;
            console.log(`📍 장소 발견: ${displayName} (Place ID: ${placeId})`);
            return placeId;

        } catch (error: any) {
            console.error(`❌ 장소 검색 실패:`, error?.response?.data || error.message);
            return null;
        }
    }

    /**
     * Step 2: Place Details API로 리뷰 가져오기
     * Legacy API 사용 → reviews_sort=newest 지원
     */
    private async getPlaceReviews(placeId: string): Promise<any[] | null> {
        try {
            // Place ID에서 "places/" 접두사 제거
            const cleanPlaceId = placeId.startsWith("places/") ? placeId.replace("places/", "") : placeId;

            // Legacy Places API — reviews_sort=newest 지원
            const response = await axios.get(
                `https://maps.googleapis.com/maps/api/place/details/json`,
                {
                    params: {
                        place_id: cleanPlaceId,
                        fields: "name,reviews,url",
                        reviews_sort: "newest",  // ★ 최신순 정렬
                        language: "ko",
                        key: GOOGLE_PLACES_API_KEY,
                    },
                    timeout: 10000,
                }
            );

            if (response.data?.status !== "OK") {
                console.error(`❌ Place Details API 상태: ${response.data?.status} — ${response.data?.error_message || ""}`);
                return null;
            }

            const result = response.data?.result || {};
            const reviews = result.reviews || [];
            const placeName = result.name || "";
            const placeUrl = result.url || "";

            console.log(`📝 Google Places API: ${placeName} — ${reviews.length}개 리뷰 (최신순, url: ${placeUrl})`);
            
            // reviews에 장소 정보 첨부
            return reviews.map((r: any) => ({
                ...r,
                _placeName: placeName,
                _placeUrl: placeUrl,
            }));

        } catch (error: any) {
            const status = error?.response?.status;
            const data = error?.response?.data;
            console.error(`❌ Place Details API 실패 (${status}):`, JSON.stringify(data || error.message).substring(0, 300));
            
            if (status === 403) {
                console.error("🔑 API 키 권한 문제: Google Cloud Console에서 Places API를 활성화했는지 확인하세요.");
            }

            return null;
        }
    }

    /**
     * Step 3: Google Places API 리뷰 → PostData[] 변환
     * Legacy API 응답 필드: text, author_name, rating, time, relative_time_description, author_url
     */
    private convertGoogleReviews(reviews: any[], query: string, placeId: string, maxReviews: number): PostData[] {
        const posts: PostData[] = [];

        for (let i = 0; i < Math.min(reviews.length, maxReviews); i++) {
            const r = reviews[i];

            // Legacy API 필드 (text, author_name, time) + New API 호환 (originalText, authorAttribution)
            const body = (r.text || r.originalText?.text || "").trim();
            const rating = r.rating || 0;
            const author = r.author_name || r.authorAttribution?.displayName || "익명";
            const publishedAt = r.time ? new Date(r.time * 1000).toISOString() : (r.publishTime || r.relative_time_description || "");
            const placeName = r._placeName || query;
            const placeUrl = r._placeUrl || `https://www.google.com/maps/place/?q=place_id:${placeId}`;
            const reviewUrl = r.author_url || r.googleMapsUri || placeUrl;

            posts.push({
                id: `google_${i}`,
                title: `구글 리뷰${rating ? ` ⭐${rating}` : ""} — ${placeName}`,
                content: body || "(텍스트 없는 별점 리뷰)",
                author,
                publishedAt: this.parseDate(publishedAt),
                url: reviewUrl,
                platform: "google",
                source: "googleplace",
                engagement: {
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    views: 0,
                },
            });
        }

        console.log(`✅ Google Places API: ${posts.length}개 리뷰 수집 완료`);
        return posts;
    }

    // ================================================================
    //  Outscraper API (대량 수집용 — 보존)
    // ================================================================

    /**
     * 구글 맵 리뷰 수집 — Outscraper API (비동기 polling 모드)
     * 대량 수집이 필요할 때 사용 (최대 수십~수백 개 리뷰)
     */
    async crawlGooglePlaceOutscraper(query: string, maxReviews: number = 20): Promise<PostData[]> {
        console.log(`🔍 구글 플레이스 리뷰 수집 (Outscraper 비동기): query=${query}, max=${maxReviews}`);

        if (!OUTSCRAPER_API_KEY) {
            console.error("❌ OUTSCRAPER_API_KEY가 설정되지 않았습니다.");
            return [];
        }

        try {
            const requestId = await this.submitAsyncRequest(query, maxReviews);
            if (!requestId) return [];

            const resultData = await this.pollForResults(requestId);
            if (!resultData) return [];

            return this.parseOutscraperData(resultData, query, maxReviews);

        } catch (error: any) {
            const status = error?.response?.status;
            const msg = JSON.stringify(error?.response?.data || error?.message).substring(0, 300);
            console.error(`❌ Outscraper API 실패 (${status || error?.code}): ${msg}`);

            if (status === 402) {
                console.error("💰 Outscraper 크레딧이 부족합니다. outscraper.com에서 충전하세요.");
            }

            return [];
        }
    }

    /** Outscraper: 비동기 작업 제출 → request_id 반환 */
    private async submitAsyncRequest(query: string, maxReviews: number): Promise<string | null> {
        try {
            const response = await axios.get(`${OUTSCRAPER_API_BASE}/maps/reviews-v3`, {
                params: {
                    query,
                    reviewsLimit: maxReviews,
                    sort: "newest",
                    language: "ko",
                    async: true,
                },
                headers: { "X-API-KEY": OUTSCRAPER_API_KEY },
                timeout: 30000,
            });

            const requestId = response.data?.id;
            if (!requestId) {
                console.error("❌ Outscraper 비동기 요청에서 request_id를 받지 못했습니다:", JSON.stringify(response.data).substring(0, 300));
                return null;
            }

            console.log(`📋 Outscraper 작업 접수 완료 (request_id: ${requestId})`);
            return requestId;
        } catch (error: any) {
            console.error(`❌ Outscraper 작업 제출 실패:`, error?.message);
            return null;
        }
    }

    /** Outscraper: request_id로 결과 polling */
    private async pollForResults(requestId: string): Promise<any | null> {
        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
            await this.sleep(POLL_INTERVAL_MS);

            try {
                const response = await axios.get(`${OUTSCRAPER_API_BASE}/requests/${requestId}`, {
                    headers: { "X-API-KEY": OUTSCRAPER_API_KEY },
                    timeout: 15000,
                    validateStatus: (status) => status >= 200 && status < 300,
                });

                const httpStatus = response.status;
                const bodyStatus = response.data?.status;

                if (bodyStatus === "Success" || (httpStatus === 200 && bodyStatus !== "Pending" && bodyStatus !== "Error" && response.data?.data)) {
                    console.log(`✅ Outscraper 작업 완료 (${attempt}회 polling, 약 ${attempt * 15}초 소요)`);
                    return response.data;
                } else if (bodyStatus === "Pending" || httpStatus === 202) {
                    console.log(`⏳ Outscraper 처리 중... (${attempt}/${MAX_POLL_ATTEMPTS})`);
                    continue;
                } else if (bodyStatus === "Error" || httpStatus === 204) {
                    console.error(`❌ Outscraper 작업 실패 (httpStatus: ${httpStatus}, bodyStatus: ${bodyStatus})`);
                    return null;
                } else {
                    console.warn(`⚠️ Outscraper 알 수 없는 상태 (http: ${httpStatus}, body: ${bodyStatus}) — 재시도`);
                    continue;
                }
            } catch (error: any) {
                console.warn(`⚠️ Polling 오류 (${attempt}/${MAX_POLL_ATTEMPTS}):`, error?.message);
            }
        }

        console.error(`❌ Outscraper 작업 타임아웃: ${MAX_POLL_ATTEMPTS}회 polling 후에도 완료되지 않음`);
        return null;
    }

    /** Outscraper: 응답 데이터를 PostData[]로 변환 */
    private parseOutscraperData(data: any, query: string, maxReviews: number): PostData[] {
        let placeData: any = null;

        if (data?.data && Array.isArray(data.data)) {
            const innerData = data.data[0];
            placeData = Array.isArray(innerData) ? innerData[0] : innerData;
        } else if (Array.isArray(data)) {
            placeData = data[0];
        } else if (data?.results && Array.isArray(data.results)) {
            placeData = data.results[0];
        }

        if (!placeData) {
            console.warn("⚠️ Outscraper 응답에 데이터 없음:", JSON.stringify(data).substring(0, 300));
            return [];
        }

        const placeName = placeData.name || placeData.query || query;
        const placeUrl = placeData.place_url || placeData.google_maps_url || "";
        const reviews: any[] = placeData.reviews_data || placeData.reviews || [];

        console.log(`📝 Outscraper 응답: ${placeName} — ${reviews.length}개 리뷰`);

        const posts: PostData[] = [];

        for (let i = 0; i < Math.min(reviews.length, maxReviews); i++) {
            const r = reviews[i];

            const body = (r.review_text || r.text || r.snippet || "").trim();
            const rating = r.review_rating || r.rating;
            const author = r.author_title || r.author_name || r.reviewer_name || "익명";
            const publishedAt = r.review_datetime_utc || r.review_date || r.date || "";

            posts.push({
                id: `google_${r.review_id || r.id || i}`,
                title: `구글 리뷰${rating ? ` ⭐${rating}` : ""} — ${placeName}`,
                content: body || "(텍스트 없는 별점 리뷰)",
                author,
                publishedAt: this.parseDate(publishedAt),
                url: r.review_link || placeUrl,
                platform: "google",
                source: "googleplace",
                engagement: {
                    likes: r.review_likes || 0,
                    comments: 0,
                    shares: 0,
                    views: 0,
                },
            });
        }

        console.log(`✅ Outscraper: ${posts.length}개 리뷰 수집 완료`);
        return posts;
    }

    // ================================================================
    //  공통 유틸리티
    // ================================================================

    /** 대기 유틸리티 */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 구글 맵 URL에서 검색 쿼리 추출
     * 지원 패턴:
     *   - place_id:ChIJ...  (직접 Place ID)
     *   - ChIJ...           (Place ID만)
     *   - https://maps.google.com/maps/place/매장이름/...
     *   - https://www.google.com/maps/place/매장이름/@lat,lng,...
     *   - https://maps.app.goo.gl/... (단축 URL)
     *   - 장소명+주소 직접 입력 (ex: "창조트리치과 서울")
     */
    extractGoogleQuery(url: string): string | null {
        try {
            // 1. Place ID 직접 입력
            if (url.startsWith("place_id:")) return url;
            if (/^ChIJ[a-zA-Z0-9_-]{10,}/.test(url)) return `place_id:${url}`;

            // 2. 단축 URL — 장소명으로는 변환 불가, URL 그대로 전달
            if (url.includes("maps.app.goo.gl") || url.includes("goo.gl/maps")) {
                console.log(`🔗 단축 URL 감지: 그대로 전달`);
                return url;
            }

            // 3. Google Maps URL — /maps/place/{장소명}/...
            const placeMatch = url.match(/\/maps\/place\/([^/@?&#]+)/);
            if (placeMatch) {
                const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
                if (placeName) {
                    console.log(`🔗 구글맵 URL에서 장소명 추출: "${placeName}"`);
                    return placeName;
                }
            }

            // 4. 검색 URL — ?q= 파라미터
            const qMatch = url.match(/[?&]q=([^&]+)/);
            if (qMatch) {
                const query = decodeURIComponent(qMatch[1].replace(/\+/g, " ")).trim();
                if (query) {
                    console.log(`🔗 검색 URL에서 쿼리 추출: "${query}"`);
                    return query;
                }
            }

            // 5. URL이 아닌 장소명/주소 직접 입력
            if (!url.startsWith("http")) {
                return url.trim();
            }

            // 6. 파싱 실패 시 URL 그대로 전달
            console.warn(`⚠️ 구글 URL 파싱 불확실 — 그대로 전달: ${url}`);
            return url;
        } catch {
            return url;
        }
    }

    private parseDate(raw: any): string {
        if (!raw) return new Date().toLocaleDateString("ko-KR");
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toLocaleDateString("ko-KR");
        // "2 months ago" 같은 상대시간 처리
        if (typeof raw === "string" && raw.includes("ago")) {
            return raw;
        }
        return String(raw);
    }
}

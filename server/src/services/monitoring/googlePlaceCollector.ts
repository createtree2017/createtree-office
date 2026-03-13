import axios from "axios";
import type { PostData } from "./types.js";

const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || "";
const API_BASE = "https://api.app.outscraper.com";

/**
 * 구글 플레이스 리뷰 수집기 — Outscraper SaaS API
 * 공식 API로 구글 맵 리뷰를 안정적으로 수집
 */
export class GooglePlaceCollector {

    /**
     * 구글 맵 리뷰 수집
     * @param query - 장소명, 주소, 또는 Google Place ID (place_id:ChIJ...)
     * @param maxReviews - 최대 수집 리뷰 수
     */
    async crawlGooglePlace(query: string, maxReviews: number = 20): Promise<PostData[]> {
        console.log(`🔍 구글 플레이스 리뷰 수집 (Outscraper): query=${query}, max=${maxReviews}`);

        if (!OUTSCRAPER_API_KEY) {
            console.error("❌ OUTSCRAPER_API_KEY가 설정되지 않았습니다.");
            return [];
        }

        try {
            const response = await axios.get(`${API_BASE}/maps/reviews-v3`, {
                params: {
                    query,
                    reviewsLimit: maxReviews,
                    sort: "newest",
                    language: "ko",
                    async: false,
                },
                headers: {
                    "X-API-KEY": OUTSCRAPER_API_KEY,
                },
                timeout: 60000, // Outscraper 처리 시간 고려 60초
            });

            const data = response.data;

            // Outscraper 응답 구조: { id, status, data: [[...reviews_data]] }
            // 또는 동기 모드: 바로 배열로 반환
            let placeData: any = null;

            if (Array.isArray(data)) {
                // 동기 모드 응답: 바로 배열
                placeData = data[0];
            } else if (data?.data && Array.isArray(data.data)) {
                placeData = data.data[0];
            } else if (data?.results && Array.isArray(data.results)) {
                placeData = data.results[0];
            }

            if (!placeData) {
                console.warn("⚠️ Outscraper 응답에 데이터 없음:", JSON.stringify(data).substring(0, 300));
                return [];
            }

            // placeData 자체가 장소 + 리뷰 데이터를 포함
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

            console.log(`✅ 구글 플레이스 ${posts.length}개 리뷰 수집 완료`);
            return posts;
        } catch (error: any) {
            const status = error?.response?.status;
            const msg = JSON.stringify(error?.response?.data || error?.message).substring(0, 300);
            console.error(`❌ Outscraper API 실패 (${status || error?.code}): ${msg}`);

            // 402 = 크레딧 부족, 429 = Rate limit
            if (status === 402) {
                console.error("💰 Outscraper 크레딧이 부족합니다. outscraper.com에서 충전하세요.");
            }

            return [];
        }
    }

    /**
     * 구글 맵 URL에서 Outscraper 검색 쿼리 추출
     * 지원 패턴:
     *   - place_id:ChIJ...  (직접 Place ID)
     *   - ChIJ...           (Place ID만)
     *   - https://maps.google.com/maps/place/매장이름/...
     *   - https://www.google.com/maps/place/매장이름/@lat,lng,...
     *   - https://maps.app.goo.gl/... (단축 URL → URL 그대로 전달, Outscraper가 처리)
     *   - 장소명+주소 직접 입력 (ex: "창조트리치과 서울")
     */
    extractGoogleQuery(url: string): string | null {
        try {
            // 1. Place ID 직접 입력
            if (url.startsWith("place_id:")) return url;
            if (/^ChIJ[a-zA-Z0-9_-]{10,}/.test(url)) return `place_id:${url}`;

            // 2. 단축 URL (maps.app.goo.gl) — Outscraper가 리디렉션 처리 가능
            if (url.includes("maps.app.goo.gl") || url.includes("goo.gl/maps")) {
                console.log(`🔗 단축 URL 감지: Outscraper에 직접 전달`);
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

            // 6. 파싱 실패 시 URL 그대로 전달 (Outscraper에서 처리 시도)
            console.warn(`⚠️ 구글 URL 파싱 불확실 — URL 그대로 전달: ${url}`);
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
            return raw; // 그대로 반환 (프론트에서 표시)
        }
        return String(raw);
    }
}

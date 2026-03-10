import axios from "axios";
import type { PostData } from "./types.js";

/**
 * 플레이스 크롤러 - 네이버 플레이스 & 카카오맵 리뷰 수집
 * Puppeteer 대신 네이버/카카오 내부 API 직접 호출 방식 (안정적)
 */
export class PlaceCrawler {

    // Puppeteer 호환성 유지를 위한 더미 메서드
    async close(): Promise<void> {
        // no-op (브라우저 미사용)
    }

    // ===============================================
    // 네이버 플레이스 리뷰 수집 (내부 API 방식)
    // ===============================================
    async crawlNaverPlace(placeId: string, maxReviews: number = 20): Promise<PostData[]> {
        console.log(`🔍 네이버 플레이스 API 호출: placeId=${placeId}, max=${maxReviews}`);
        const posts: PostData[] = [];

        try {
            // 네이버 플레이스 방문자 리뷰 API (내부 API)
            // 실제 네이버가 앱/웹에서 사용하는 GraphQL 기반 내부 API
            const url = `https://api.place.naver.com/graphql`;
            const query = {
                operationName: "getVisitorReviews",
                variables: {
                    input: {
                        businessId: placeId,
                        businessType: "place",
                        item: "0",
                        page: 1,
                        size: Math.min(maxReviews, 100),
                        isPhotoUsed: false,
                        includeContent: true,
                        getUserStats: true,
                        includeReceiptPhotos: true,
                        cidList: [],
                    },
                },
                query: `query getVisitorReviews($input: VisitorReviewsInput) {
                    visitorReviews(input: $input) {
                        items {
                            id
                            rating
                            author { nickname }
                            body
                            created
                            visitCount
                        }
                        totalCount
                    }
                }`,
            };

            const headers = {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                "Referer": `https://map.naver.com/p/entry/place/${placeId}`,
                "Origin": "https://map.naver.com",
            };

            const response = await axios.post(url, query, { headers, timeout: 10000 });
            const items = response.data?.data?.visitorReviews?.items || [];

            console.log(`📝 네이버 플레이스 GraphQL 리뷰 ${items.length}개 수집됨`);

            for (let i = 0; i < Math.min(items.length, maxReviews); i++) {
                const r = items[i];
                if (!r.body || r.body.length < 3) continue;
                posts.push({
                    id: `nplace_${placeId}_${r.id || i}`,
                    title: `네이버 플레이스 리뷰 (별점 ${r.rating || "?"}점)`,
                    content: r.body,
                    author: r.author?.nickname || "익명",
                    publishedAt: r.created ? new Date(r.created).toLocaleDateString("ko-KR") : new Date().toLocaleDateString("ko-KR"),
                    url: `https://map.naver.com/p/entry/place/${placeId}`,
                    platform: "naver",
                    source: "naverplace",
                });
            }

            // GraphQL API 실패 시 Fallback: 일반 REST API 시도
            if (posts.length === 0) {
                console.log(`⚠️ GraphQL API 결과 없음, REST API fallback 시도...`);
                return await this.crawlNaverPlaceFallback(placeId, maxReviews);
            }

        } catch (error: any) {
            console.error(`❌ 네이버 플레이스 API 실패:`, error?.message || error);
            console.log(`⚠️ REST API fallback 시도...`);
            return await this.crawlNaverPlaceFallback(placeId, maxReviews);
        }

        return posts;
    }

    // Fallback: 네이버 플레이스 REST API
    private async crawlNaverPlaceFallback(placeId: string, maxReviews: number): Promise<PostData[]> {
        const posts: PostData[] = [];
        try {
            // 네이버 플레이스 방문자 리뷰 REST API
            const url = `https://place.map.naver.com/restaurant/pc/main/review/visitor?businessId=${placeId}&page=1&size=${Math.min(maxReviews, 100)}&isPhotoUsed=false&includeContent=true`;
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": `https://map.naver.com/`,
            };

            const response = await axios.get(url, { headers, timeout: 10000 });
            const data = response.data;

            // 다양한 응답 구조 처리
            const items = data?.result?.items || data?.items || data?.visitorReviews?.items || [];
            console.log(`📝 네이버 플레이스 REST API 리뷰 ${items.length}개`);

            for (let i = 0; i < Math.min(items.length, maxReviews); i++) {
                const r = items[i];
                const body = r.body || r.content || r.text || "";
                if (!body || body.length < 3) continue;
                posts.push({
                    id: `nplace_${placeId}_fb_${i}`,
                    title: `네이버 플레이스 리뷰`,
                    content: body,
                    author: r.author?.nickname || r.authorName || "익명",
                    publishedAt: r.created || r.date || new Date().toLocaleDateString("ko-KR"),
                    url: `https://map.naver.com/p/entry/place/${placeId}`,
                    platform: "naver",
                    source: "naverplace",
                });
            }
        } catch (err: any) {
            console.error(`❌ 네이버 플레이스 REST fallback 실패:`, err?.message);
        }
        return posts;
    }

    // ===============================================
    // 카카오맵 리뷰 수집 (내부 API 방식)
    // ===============================================
    async crawlKakaoMap(placeId: string, maxReviews: number = 20): Promise<PostData[]> {
        console.log(`🔍 카카오맵 API 호출: placeId=${placeId}, max=${maxReviews}`);
        const posts: PostData[] = [];

        try {
            // 카카오맵 리뷰 API
            const url = `https://place.map.kakao.com/main/v/${placeId}`;
            const headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KakaoMap/3.0",
                "Referer": `https://map.kakao.com/`,
            };

            const response = await axios.get(url, { headers, timeout: 10000 });
            const data = response.data;

            // 카카오 플레이스 정보에서 리뷰 접근
            const commentList = data?.basicInfo?.commentInfo?.commentList || [];
            console.log(`📝 카카오맵 리뷰 ${commentList.length}개 수집됨`);

            for (let i = 0; i < Math.min(commentList.length, maxReviews); i++) {
                const r = commentList[i];
                const body = r?.contents || r?.text || "";
                if (!body || body.length < 3) continue;
                posts.push({
                    id: `kakao_${placeId}_${i}`,
                    title: `카카오맵 리뷰`,
                    content: body,
                    author: r?.username || r?.author || "익명",
                    publishedAt: r?.datetime || r?.date || new Date().toLocaleDateString("ko-KR"),
                    url: `https://place.map.kakao.com/${placeId}`,
                    platform: "kakao",
                    source: "kakaomap",
                });
            }

            // 카카오 API 실패 시 fallback
            if (posts.length === 0) {
                return await this.crawlKakaoMapFallback(placeId, maxReviews);
            }

        } catch (error: any) {
            console.error(`❌ 카카오맵 API 실패:`, error?.message);
            return await this.crawlKakaoMapFallback(placeId, maxReviews);
        }

        return posts;
    }

    // Fallback: 카카오맵 댓글 API
    private async crawlKakaoMapFallback(placeId: string, maxReviews: number): Promise<PostData[]> {
        const posts: PostData[] = [];
        try {
            const url = `https://place.map.kakao.com/commentlist/v/${placeId}?page=1&size=${Math.min(maxReviews, 50)}`;
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": `https://map.kakao.com/`,
            };

            const response = await axios.get(url, { headers, timeout: 10000 });
            const items = response.data?.comment?.list || response.data?.list || [];
            console.log(`📝 카카오맵 fallback 리뷰 ${items.length}개`);

            for (let i = 0; i < Math.min(items.length, maxReviews); i++) {
                const r = items[i];
                const body = r?.contents || r?.text || "";
                if (!body || body.length < 3) continue;
                posts.push({
                    id: `kakao_${placeId}_fb_${i}`,
                    title: `카카오맵 리뷰`,
                    content: body,
                    author: r?.username || "익명",
                    publishedAt: r?.datetime || new Date().toLocaleDateString("ko-KR"),
                    url: `https://place.map.kakao.com/${placeId}`,
                    platform: "kakao",
                    source: "kakaomap",
                });
            }
        } catch (err: any) {
            console.error(`❌ 카카오맵 fallback 실패:`, err?.message);
        }
        return posts;
    }

    // 키워드 기반 플레이스 검색 (통합검색 타입용, 미사용)
    async crawlPlacesByKeyword(keywords: string[], scope: string[], maxReviews: number = 20): Promise<PostData[]> {
        return [];
    }
}

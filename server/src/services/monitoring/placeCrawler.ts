import axios from "axios";
import type { PostData } from "./types.js";

/**
 * 플레이스 크롤러 - 네이버 플레이스 & 카카오맵 리뷰 수집
 * 네이버: pcmap-api.place.naver.com GraphQL API 사용 (검증 완료)
 * 카카오: place.map.kakao.com REST API 사용
 */
export class PlaceCrawler {

    async close(): Promise<void> {
        // no-op - 브라우저 미사용
    }

    // ===============================================
    // 네이버 플레이스 리뷰 수집 (GraphQL API)
    // ===============================================
    async crawlNaverPlace(placeId: string, maxReviews: number = 20): Promise<PostData[]> {
        console.log(`🔍 네이버 플레이스 리뷰 수집: placeId=${placeId}, max=${maxReviews}`);

        const allPosts: PostData[] = [];
        const collectedIds = new Set<string>();  // 중복 방지
        const pageSize = Math.min(maxReviews, 100);
        let page = 1;

        try {
            while (allPosts.length < maxReviews) {
                const response = await axios.post(
                    "https://pcmap-api.place.naver.com/graphql",
                    // 배열 형태로 전송 (네이버 실제 방식)
                    [{
                        operationName: "getVisitorReviews",
                        variables: {
                            input: {
                                businessId: placeId,
                                businessType: "place",
                                item: "0",
                                page,
                                size: pageSize,
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
                                    visitedDate
                                    visitCount
                                }
                                total
                            }
                        }`,
                    }],
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                            "Referer": `https://m.place.naver.com/place/${placeId}/review/visitor`,
                            "Origin": "https://m.place.naver.com",
                        },
                        timeout: 12000,
                    }
                );

                const data = Array.isArray(response.data) ? response.data[0] : response.data;
                const items: any[] = data?.data?.visitorReviews?.items || [];
                const total: number = data?.data?.visitorReviews?.total || 0;

                console.log(`📝 네이버 플레이스 p${page} - ${items.length}개 / 전체 ${total}개`);

                if (items.length === 0) break;

                let addedThisPage = 0;
                for (const r of items) {
                    if (allPosts.length >= maxReviews) break;
                    const postId = `nplace_${placeId}_${r.id || allPosts.length}`;
                    if (collectedIds.has(postId)) continue;  // 중복 스킵
                    collectedIds.add(postId);

                    const body = (r.body || "").trim();
                    allPosts.push({
                        id: postId,
                        title: `네이버 플레이스 리뷰${r.rating ? ` ⭐${r.rating}` : ""}`,
                        content: body,  // 이미지 전용은 빈 문자열
                        author: r.author?.nickname || "익명",
                        publishedAt: this.parseDate(r.created),
                        visitedAt: r.visitedDate ? this.parseDate(r.visitedDate) : undefined,
                        url: `https://map.naver.com/p/entry/place/${placeId}`,
                        platform: "naver",
                        source: "naverplace",
                    });
                    addedThisPage++;
                }

                // 더 이상 가져올 데이터 없으면 중단
                if (items.length < pageSize || allPosts.length >= total || addedThisPage === 0) break;
                page++;
                await this.delay(500); // rate limit 방지
            }
        } catch (error: any) {
            const status = error?.response?.status;
            const msg = JSON.stringify(error?.response?.data || error?.message).substring(0, 200);
            console.error(`❌ 네이버 플레이스 API 실패 (${status}): ${msg}`);
        }

        console.log(`✅ 네이버 플레이스 총 ${allPosts.length}개 수집 완료`);
        return allPosts;
    }

    // ===============================================
    // 카카오맵 리뷰 수집
    // ===============================================
    async crawlKakaoMap(placeId: string, maxReviews: number = 20): Promise<PostData[]> {
        console.log(`🔍 카카오맵 리뷰 수집: placeId=${placeId}, max=${maxReviews}`);
        const posts: PostData[] = [];

        // 시도 1: commentlist API
        try {
            const url = `https://place.map.kakao.com/commentlist/v/${placeId}?page=1&size=${Math.min(maxReviews, 50)}`;
            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://map.kakao.com/",
                },
                timeout: 10000,
            });

            const items: any[] =
                response.data?.comment?.list ||
                response.data?.commentList ||
                response.data?.list ||
                [];

            console.log(`📝 카카오 commentlist API ${items.length}개`);

            for (let i = 0; i < Math.min(items.length, maxReviews); i++) {
                const r = items[i];
                const body = (r?.contents || r?.comment || r?.text || "").trim();
                if (!body || body.length < 3) continue;
                posts.push({
                    id: `kakao_${placeId}_${i}`,
                    title: `카카오맵 리뷰`,
                    content: body,
                    author: r?.username || r?.name || "익명",
                    publishedAt: r?.datetime || r?.date || new Date().toLocaleDateString("ko-KR"),
                    url: `https://place.map.kakao.com/${placeId}`,
                    platform: "kakao",
                    source: "kakaomap",
                });
            }

            if (posts.length > 0) {
                console.log(`✅ 카카오맵 ${posts.length}개 수집 완료`);
                return posts;
            }
        } catch (err: any) {
            console.warn(`⚠️ 카카오 commentlist API 실패: ${err?.response?.status || err?.message}`);
        }

        // 시도 2: main API
        try {
            const url = `https://place.map.kakao.com/main/v/${placeId}`;
            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                    "Referer": "https://map.kakao.com/",
                },
                timeout: 10000,
            });

            const items: any[] =
                response.data?.basicInfo?.commentInfo?.commentList || [];

            console.log(`📝 카카오 main API ${items.length}개`);

            for (let i = 0; i < Math.min(items.length, maxReviews); i++) {
                const r = items[i];
                const body = (r?.contents || r?.text || "").trim();
                if (!body || body.length < 3) continue;
                posts.push({
                    id: `kakao_${placeId}_m_${i}`,
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
            console.warn(`⚠️ 카카오 main API 실패: ${err?.response?.status || err?.message}`);
        }

        console.log(`✅ 카카오맵 ${posts.length}개 수집 완료`);
        return posts;
    }

    // 키워드 기반 (미사용, 인터페이스 호환용)
    async crawlPlacesByKeyword(keywords: string[], scope: string[], maxReviews: number = 20): Promise<PostData[]> {
        return [];
    }

    private parseDate(raw: any): string {
        if (!raw) return new Date().toLocaleDateString("ko-KR");
        const num = Number(raw);
        if (!isNaN(num) && num > 1000000000) {
            const ms = num < 10000000000 ? num * 1000 : num;
            return new Date(ms).toLocaleDateString("ko-KR");
        }
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toLocaleDateString("ko-KR");
        const match = String(raw).match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
        if (match) return match[1] + ". " + parseInt(match[2]) + ". " + parseInt(match[3]) + ".";
        return String(raw);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

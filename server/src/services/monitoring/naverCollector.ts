import type { PostData, CrawlOptions } from "./types.js";

/**
 * 네이버 검색 API 기반 수집기
 * CMP의 NaverAPICrawler를 리팩토링하여 타입 안전성 강화
 */
export class NaverCollector {
    private clientId: string;
    private clientSecret: string;

    constructor() {
        this.clientId = process.env.NAVER_CLIENT_ID || "";
        this.clientSecret = process.env.NAVER_CLIENT_SECRET || "";
    }

    async crawlSearch(keywords: string[], options: CrawlOptions): Promise<PostData[]> {
        console.log("🔍 네이버 API 크롤링 시작 - 키워드:", keywords);

        if (!this.clientId || !this.clientSecret) {
            console.error("❌ 네이버 API 키가 설정되지 않았습니다.");
            return [];
        }

        const allPosts: PostData[] = [];

        for (const keyword of keywords) {
            try {
                if (options.scope?.includes("blog")) {
                    const blogPosts = await this.searchNaverAPI(keyword, "blog", options);
                    allPosts.push(...blogPosts);
                }

                if (options.scope?.includes("cafe")) {
                    const cafePosts = await this.searchNaverAPI(keyword, "cafearticle", options);
                    allPosts.push(...cafePosts);
                }

                if (options.scope?.includes("news")) {
                    const newsPosts = await this.searchNaverAPI(keyword, "news", options);
                    allPosts.push(...newsPosts);
                }
            } catch (error) {
                console.error(`❌ 키워드 "${keyword}" API 크롤링 실패:`, error);
            }
        }

        return this.deduplicatePosts(allPosts);
    }

    private async searchNaverAPI(
        keyword: string,
        searchType: "blog" | "cafearticle" | "news",
        options: CrawlOptions
    ): Promise<PostData[]> {
        const encodedKeyword = encodeURIComponent(keyword);
        const sortParam = options.searchType === "accuracy" ? "sim" : "date";
        const displayCount = Math.min(options.collectCount || 10, 100);

        const apiUrl = `https://openapi.naver.com/v1/search/${searchType}?query=${encodedKeyword}&display=${displayCount}&start=1&sort=${sortParam}`;

        try {
            const response = await fetch(apiUrl, {
                headers: {
                    "X-Naver-Client-Id": this.clientId,
                    "X-Naver-Client-Secret": this.clientSecret,
                },
            });

            if (!response.ok) {
                throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
            }

            const data = (await response.json()) as any;

            if (!data.items || !Array.isArray(data.items)) {
                return [];
            }

            const sourceMap: Record<string, "blog" | "cafe" | "news"> = {
                blog: "blog",
                cafearticle: "cafe",
                news: "news",
            };

            return data.items.map((item: any, index: number) => ({
                id: `naver_${searchType}_${keyword}_${Date.now()}_${index}`,
                title: this.cleanHtml(item.title || ""),
                content: this.cleanHtml(item.description || ""),
                author: this.cleanHtml(item.bloggername || item.cafename || item.originallink || "익명"),
                url: item.link || "",
                publishedAt: this.formatDate(item.postdate || item.pubDate || ""),
                platform: "naver" as const,
                source: sourceMap[searchType],
                engagement: { likes: 0, comments: 0, shares: 0, views: 0 },
            }));
        } catch (error) {
            console.error(`네이버 ${searchType} API 오류:`, error);
            return [];
        }
    }

    private cleanHtml(text: string): string {
        return text
            .replace(/<[^>]*>/g, "")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }

    private formatDate(dateString: string): string {
        if (!dateString) return new Date().toISOString().split("T")[0];

        // 네이버 API 날짜 형식: YYYYMMDD
        if (dateString.length === 8 && !dateString.includes("-")) {
            return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`;
        }

        // RSS pubDate 형식
        try {
            return new Date(dateString).toISOString().split("T")[0];
        } catch {
            return new Date().toISOString().split("T")[0];
        }
    }

    private deduplicatePosts(posts: PostData[]): PostData[] {
        const seen = new Set<string>();
        return posts.filter((post) => {
            const key = post.title.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

import puppeteer, { Browser, Page } from "puppeteer";
import type { PostData } from "./types.js";

/**
 * 플레이스 크롤러 - 네이버 플레이스 & 카카오맵 리뷰 수집
 * Puppeteer 기반 헤드리스 브라우저 크롤링
 */
export class PlaceCrawler {
    private browser: Browser | null = null;

    private async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--window-size=1280,720",
                ],
            });
        }
        return this.browser;
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    // ===============================================
    // 네이버 플레이스 리뷰 크롤링
    // ===============================================
    async crawlNaverPlace(placeId: string, maxReviews: number = 20): Promise<PostData[]> {
        const posts: PostData[] = [];
        let page: Page | null = null;

        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();

            await page.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
            );
            await page.setViewport({ width: 1280, height: 720 });

            // 네이버 플레이스 방문자 리뷰 페이지
            const url = `https://m.place.naver.com/restaurant/${placeId}/review/visitor`;
            console.log(`🔍 네이버 플레이스 크롤링: ${url}`);
            await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

            // 리뷰 영역이 로드될 때까지 대기
            await page.waitForSelector('[class*="review"]', { timeout: 8000 }).catch(() => {
                console.log("⚠️ 리뷰 영역 로드 대기 시간 초과, 현재 상태로 진행");
            });

            // "더보기" 클릭으로 더 많은 리뷰 로드
            let clickCount = 0;
            const maxClicks = Math.ceil(maxReviews / 10);
            while (clickCount < maxClicks) {
                try {
                    const moreBtn = await page.$('[class*="more"]');
                    if (!moreBtn) break;
                    await moreBtn.click();
                    await this.delay(1500);
                    clickCount++;
                } catch { break; }
            }

            // 리뷰 데이터 추출
            const reviews = await page.evaluate(() => {
                const items: Array<{ text: string; author: string; date: string; rating?: string }> = [];

                // 방문자 리뷰 컨테이너 탐색
                const reviewEls = document.querySelectorAll('[class*="review_item"], [class*="YeInn"], li[class*="owAeM"]');
                reviewEls.forEach(el => {
                    const textEl = el.querySelector('[class*="text"], [class*="review_contents"], [class*="zPfVt"]');
                    const authorEl = el.querySelector('[class*="name"], [class*="author"], [class*="place_apply"]');
                    const dateEl = el.querySelector('[class*="date"], [class*="time"], [class*="_1JqaE"]');

                    const text = textEl?.textContent?.trim() || "";
                    const author = authorEl?.textContent?.trim() || "익명";
                    const date = dateEl?.textContent?.trim() || "";

                    if (text.length > 5) {
                        items.push({ text, author, date });
                    }
                });

                return items;
            });

            console.log(`📝 네이버 플레이스 리뷰 ${reviews.length}개 수집됨`);

            for (let i = 0; i < Math.min(reviews.length, maxReviews); i++) {
                const r = reviews[i];
                posts.push({
                    id: `nplace_${placeId}_${i}`,
                    title: `네이버 플레이스 리뷰`,
                    content: r.text,
                    author: r.author,
                    publishedAt: r.date || new Date().toISOString(),
                    url: `https://m.place.naver.com/restaurant/${placeId}/review/visitor`,
                    platform: "naver",
                    source: "naverplace",
                });
            }
        } catch (error) {
            console.error("❌ 네이버 플레이스 크롤링 실패:", error);
        } finally {
            if (page) await page.close();
        }

        return posts;
    }

    // ===============================================
    // 카카오맵 리뷰 크롤링
    // ===============================================
    async crawlKakaoMap(placeId: string, maxReviews: number = 20): Promise<PostData[]> {
        const posts: PostData[] = [];
        let page: Page | null = null;

        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();

            await page.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
            );
            await page.setViewport({ width: 1280, height: 720 });

            const url = `https://place.map.kakao.com/${placeId}`;
            console.log(`🔍 카카오맵 크롤링: ${url}`);
            await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

            // 후기 탭 클릭
            await page.waitForSelector('.link_evaluation', { timeout: 5000 }).catch(() => { });
            const reviewTab = await page.$('.link_evaluation, a[href*="comment"]');
            if (reviewTab) {
                await reviewTab.click();
                await this.delay(2000);
            }

            // "더보기" 클릭으로 더 많은 리뷰 로드
            let clickCount = 0;
            const maxClicks = Math.ceil(maxReviews / 5);
            while (clickCount < maxClicks) {
                try {
                    const moreBtn = await page.$('.link_more, [class*="more"]');
                    if (!moreBtn) break;
                    await moreBtn.click();
                    await this.delay(1500);
                    clickCount++;
                } catch { break; }
            }

            // 리뷰 데이터 추출
            const reviews = await page.evaluate(() => {
                const items: Array<{ text: string; author: string; date: string }> = [];

                const reviewEls = document.querySelectorAll('.list_evaluation li, .comment_item, [class*="review"]');
                reviewEls.forEach(el => {
                    const textEl = el.querySelector('.txt_comment, .desc, [class*="text"]');
                    const authorEl = el.querySelector('.name_user, .name, [class*="name"]');
                    const dateEl = el.querySelector('.time_write, .date, [class*="date"]');

                    const text = textEl?.textContent?.trim() || "";
                    const author = authorEl?.textContent?.trim() || "익명";
                    const date = dateEl?.textContent?.trim() || "";

                    if (text.length > 5) {
                        items.push({ text, author, date });
                    }
                });

                return items;
            });

            console.log(`📝 카카오맵 리뷰 ${reviews.length}개 수집됨`);

            for (let i = 0; i < Math.min(reviews.length, maxReviews); i++) {
                const r = reviews[i];
                posts.push({
                    id: `kakao_${placeId}_${i}`,
                    title: `카카오맵 리뷰`,
                    content: r.text,
                    author: r.author,
                    publishedAt: r.date || new Date().toISOString(),
                    url: `https://place.map.kakao.com/${placeId}`,
                    platform: "kakao",
                    source: "kakaomap",
                });
            }
        } catch (error) {
            console.error("❌ 카카오맵 크롤링 실패:", error);
        } finally {
            if (page) await page.close();
        }

        return posts;
    }

    // ===============================================
    // 통합 검색 키워드 기반 플레이스 크롤링
    // ===============================================
    async crawlPlacesByKeyword(
        keywords: string[],
        scope: string[],
        maxReviews: number = 20
    ): Promise<PostData[]> {
        const allPosts: PostData[] = [];
        let page: Page | null = null;

        try {
            const browser = await this.getBrowser();

            for (const keyword of keywords) {
                // 네이버 플레이스 검색
                if (scope.includes("naverplace")) {
                    try {
                        page = await browser.newPage();
                        await page.setUserAgent(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
                        );

                        const searchUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(keyword)}&sm=hty&style=v5`;
                        console.log(`🔍 네이버 플레이스 검색: ${keyword}`);
                        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 15000 });

                        await this.delay(3000);

                        // 검색 결과에서 첫 번째 장소의 ID 추출
                        const placeIds = await page.evaluate(() => {
                            const ids: string[] = [];
                            const links = document.querySelectorAll('a[href*="place/"]');
                            links.forEach(link => {
                                const href = (link as HTMLAnchorElement).href;
                                const match = href.match(/place\/(\d+)/);
                                if (match && !ids.includes(match[1])) ids.push(match[1]);
                            });
                            return ids.slice(0, 3); // 상위 3개만
                        });

                        await page.close();
                        page = null;

                        for (const pid of placeIds) {
                            const reviews = await this.crawlNaverPlace(pid, Math.ceil(maxReviews / placeIds.length));
                            allPosts.push(...reviews);
                        }
                    } catch (error) {
                        console.error(`❌ 네이버 플레이스 검색 실패 (${keyword}):`, error);
                        if (page) { await page.close(); page = null; }
                    }
                }

                // 카카오맵 검색
                if (scope.includes("kakaomap")) {
                    try {
                        page = await browser.newPage();
                        await page.setUserAgent(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
                        );

                        const searchUrl = `https://map.kakao.com/?q=${encodeURIComponent(keyword)}`;
                        console.log(`🔍 카카오맵 검색: ${keyword}`);
                        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 15000 });

                        await this.delay(3000);

                        // 검색 결과에서 첫 번째 장소의 ID 추출
                        const placeIds = await page.evaluate(() => {
                            const ids: string[] = [];
                            const links = document.querySelectorAll('a[href*="place.map.kakao.com/"]');
                            links.forEach(link => {
                                const href = (link as HTMLAnchorElement).href;
                                const match = href.match(/kakao\.com\/(\d+)/);
                                if (match && !ids.includes(match[1])) ids.push(match[1]);
                            });
                            // data-id 속성도 확인
                            const items = document.querySelectorAll('[data-id]');
                            items.forEach(item => {
                                const id = item.getAttribute('data-id');
                                if (id && !ids.includes(id)) ids.push(id);
                            });
                            return ids.slice(0, 3);
                        });

                        await page.close();
                        page = null;

                        for (const pid of placeIds) {
                            const reviews = await this.crawlKakaoMap(pid, Math.ceil(maxReviews / Math.max(placeIds.length, 1)));
                            allPosts.push(...reviews);
                        }
                    } catch (error) {
                        console.error(`❌ 카카오맵 검색 실패 (${keyword}):`, error);
                        if (page) { await page.close(); page = null; }
                    }
                }
            }
        } catch (error) {
            console.error("❌ 플레이스 크롤링 전체 실패:", error);
        }

        return allPosts;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

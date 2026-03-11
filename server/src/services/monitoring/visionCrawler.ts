import { chromium, type Browser, type Page } from "playwright";
import { GoogleGenAI } from "@google/genai";
import type { PostData } from "./types.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * 비주얼 스크래핑 크롤러
 * Playwright(스크린샷) + Gemini 2.5 Flash Vision(이미지→데이터)
 *
 * 기존 API 방식이 차단된 카카오맵/구글 플레이스 리뷰를
 * 브라우저 스크린샷 → AI 이미지 분석으로 수집
 */
export class VisionCrawler {
    private gemini: GoogleGenAI;
    private browser: Browser | null = null;

    constructor() {
        this.gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }

    /**
     * 메인 수집 메서드: URL → 스크린샷 → Gemini Vision → PostData[]
     */
    async crawlByVision(
        url: string,
        platform: "kakaomap" | "googleplace",
        maxReviews: number = 10,
        sortOrder: "latest" | "relevant" = "relevant"
    ): Promise<PostData[]> {
        console.log(`📸 비주얼 스크래핑 시작: platform=${platform}, url=${url}`);

        if (!GEMINI_API_KEY) {
            console.error("❌ GEMINI_API_KEY가 설정되지 않았습니다.");
            return [];
        }

        try {
            // 1. 스크린샷 캡처
            const screenshot = await this.captureReviewPage(url, platform, maxReviews, sortOrder);
            if (!screenshot) {
                console.error("❌ 스크린샷 캡처 실패");
                return [];
            }
            console.log(`📷 스크린샷 캡처 완료 (${(screenshot.length / 1024).toFixed(1)}KB)`);

            // 2. Gemini Vision으로 리뷰 추출
            const posts = await this.extractReviewsFromImage(screenshot, platform, url, maxReviews);
            console.log(`✅ 비주얼 스크래핑 완료: ${posts.length}개 리뷰 추출`);

            return posts;
        } catch (error: any) {
            console.error(`❌ 비주얼 스크래핑 실패:`, error.message);
            return [];
        } finally {
            await this.closeBrowser();
        }
    }

    /**
     * Playwright로 리뷰 페이지 접속 + 스크린샷 캡처
     * viewport 높이를 maxReviews에 따라 자동 조절하여 원하는 수의 리뷰를 캡처
     */
    private async captureReviewPage(url: string, platform: string, maxReviews: number = 10, sortOrder: "latest" | "relevant" = "relevant"): Promise<Buffer | null> {
        try {
            // 리뷰 1개 ≈ 300px (카카오맵 기준), 상단 헤더 ≈ 400px
            // maxReviews에 따라 viewport 높이 자동 계산
            const REVIEW_HEIGHT_PX = 300;
            const HEADER_HEIGHT_PX = 500;
            const viewportHeight = Math.min(
                HEADER_HEIGHT_PX + (maxReviews * REVIEW_HEIGHT_PX),
                8000 // 최대 높이 제한 (너무 큰 이미지 방지)
            );

            console.log(`📐 viewport 설정: 1920×${viewportHeight} (리뷰 ~${maxReviews}개 캡처 목표)`);

            // 브라우저 인스턴스 생성 (headless)
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ],
            });

            const context = await this.browser.newContext({
                viewport: { width: 1920, height: viewportHeight },
                locale: "ko-KR",
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            });

            const page = await context.newPage();

            if (platform === "kakaomap") {
                return await this.captureKakaoMap(page, url, maxReviews, sortOrder);
            } else if (platform === "googleplace") {
                return await this.captureGooglePlace(page, url, maxReviews);
            }

            return null;
        } catch (error: any) {
            console.error(`❌ 브라우저 캡처 실패: ${error.message}`);
            return null;
        }
    }

    /**
     * 카카오맵 리뷰 페이지 캡처
     * - '더보기' 버튼 반복 클릭으로 리뷰 로드
     * - viewport 높이에 맞춰 리뷰 ~maxReviews개 캡처
     */
    private async captureKakaoMap(page: Page, url: string, maxReviews: number, sortOrder: "latest" | "relevant" = "relevant"): Promise<Buffer | null> {
        console.log("🗺️ 카카오맵 페이지 접속 중...");

        // 리뷰 탭이 포함된 URL로 접속 (#comment 해시)
        const reviewUrl = url.includes("#") ? url : `${url}#comment`;
        await page.goto(reviewUrl, { waitUntil: "networkidle", timeout: 20000 });

        // 리뷰 섹션이 로드될 때까지 대기
        await page.waitForTimeout(3000);

        // 후기 탭 클릭 시도 (있으면)
        try {
            const reviewTab = page.locator('a[href*="comment"], .tab_review, [data-target="comment"]').first();
            if (await reviewTab.isVisible({ timeout: 2000 })) {
                await reviewTab.click();
                await page.waitForTimeout(2000);
            }
        } catch {
            // 후기 탭이 없으면 무시 (이미 리뷰 화면일 수 있음)
        }

        // 정렬 변경 (sortOrder에 따라: 'latest' = 최신 순, 'relevant' = 유용한 순)
        // 기본값은 '유용한 순'이므로, 'latest'일 때만 변경 필요
        if (sortOrder === 'latest') {
            try {
                // 정렬 드롭다운 토글 버튼 (button.btn_sort)
                const sortBtn = page.locator('button.btn_sort').first();
                if (await sortBtn.isVisible({ timeout: 2000 })) {
                    await sortBtn.click();
                    await page.waitForTimeout(500);
                    // '최신 순' 옵션 클릭 (카카오맵은 "최신 순" 띄어쓰기 있음)
                    const newestOption = page.locator('a.link_sort:has-text("최신 순")').first();
                    if (await newestOption.isVisible({ timeout: 2000 })) {
                        await newestOption.click();
                        console.log("📅 정렬: 최신 순으로 변경");
                        await page.waitForTimeout(2000); // 리뷰 재로딩 대기
                    }
                }
            } catch {
                console.log("⚠️ 정렬 변경 실패 — 기본 정렬로 진행");
            }
        }

        // '더보기' 버튼 클릭 → 리뷰 추가 로드
        // 첫 화면에 약 3~5개, 더보기 1회 클릭 시 약 5~10개 추가
        if (maxReviews > 5) {
            const clickCount = Math.ceil((maxReviews - 5) / 10); // 10개씩 로드 추정
            console.log(`📜 '더보기' 버튼 ${clickCount}회 클릭 시도...`);
            for (let i = 0; i < clickCount; i++) {
                try {
                    const moreBtn = page.locator('.btn_more, button:has-text("더보기"), a:has-text("더보기")').first();
                    if (await moreBtn.isVisible({ timeout: 2000 })) {
                        await moreBtn.click();
                        await page.waitForTimeout(1500);
                    } else break;
                } catch { break; }
            }
        }

        // 리뷰 영역까지 스크롤 (리뷰가 viewport 안에 들어오도록)
        await page.evaluate(() => {
            const reviewSection = document.querySelector('.cont_review, .list_review, #mArticle');
            if (reviewSection) reviewSection.scrollIntoView({ behavior: 'instant' });
        });
        await page.waitForTimeout(1000);

        // viewport 크기만큼 스크린샷 (fullPage=false)
        const screenshot = await page.screenshot({
            type: "png",
            fullPage: false,
        });

        return Buffer.from(screenshot);
    }

    /**
     * 구글 플레이스 리뷰 페이지 캡처
     * URL: https://www.google.com/maps/place/...
     */
    private async captureGooglePlace(page: Page, url: string, maxReviews: number): Promise<Buffer | null> {
        console.log("🌍 구글 플레이스 페이지 접속 중...");

        await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(3000);

        // "리뷰" 탭 클릭 시도
        try {
            const reviewTab = page.locator('button[aria-label*="리뷰"], button:has-text("리뷰"), [data-tab-index="1"]').first();
            if (await reviewTab.isVisible({ timeout: 3000 })) {
                await reviewTab.click();
                await page.waitForTimeout(3000);
            }
        } catch {
            // 리뷰 탭이 없으면 무시
        }

        // 쿠키 동의 팝업 닫기 (있으면)
        try {
            const acceptBtn = page.locator('button:has-text("모두 수락"), button:has-text("Accept all")').first();
            if (await acceptBtn.isVisible({ timeout: 1000 })) {
                await acceptBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch { /* 무시 */ }

        const screenshot = await page.screenshot({
            type: "png",
            fullPage: false,
        });

        return Buffer.from(screenshot);
    }

    /**
     * Gemini 2.5 Flash Vision API로 스크린샷에서 리뷰 추출
     */
    private async extractReviewsFromImage(
        imageBuffer: Buffer,
        platform: string,
        url: string,
        maxReviews: number
    ): Promise<PostData[]> {
        const platformName = platform === "kakaomap" ? "카카오맵" : "구글 플레이스(구글 맵)";
        const base64Image = imageBuffer.toString("base64");

        const prompt = `당신은 온라인 리뷰 데이터 추출 전문가입니다.
이 이미지는 ${platformName}의 매장 리뷰 화면 스크린샷입니다.

이미지에 보이는 모든 리뷰를 아래 JSON 형식으로 정확히 추출하세요:

{
  "placeName": "매장 이름 (보이면)",
  "totalReviewCount": "전체 리뷰 수 (숫자, 보이면)",
  "averageRating": 4.5,
  "reviews": [
    {
      "author": "작성자 닉네임",
      "rating": 5,
      "content": "리뷰 본문 전체 텍스트",
      "date": "2026.03.10",
      "hasPhoto": false
    }
  ]
}

반드시 지켜야 할 규칙:
1. 이미지에 실제로 보이는 리뷰만 추출하세요 (절대 추측하거나 지어내지 마세요)
2. 별점은 채워진 별(★)의 개수를 정확히 세세요
3. 글씨가 잘리거나 안 보이면 "[판독불가]"로 표시
4. 리뷰가 전혀 없으면 reviews를 빈 배열로 반환
5. 최대 ${maxReviews}개까지만 추출
6. 날짜가 상대적(예: "2일 전", "1주 전")이면 그대로 기재`;

        console.log("🤖 Gemini 2.5 Flash Vision 분석 중...");

        let result: any = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await this.gemini.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [{
                        role: "user",
                        parts: [
                            {
                                inlineData: {
                                    mimeType: "image/png",
                                    data: base64Image,
                                },
                            },
                            { text: prompt },
                        ],
                    }],
                    config: {
                        temperature: 0.2, // 낮은 온도 = 정확한 추출
                        maxOutputTokens: 8192,
                        responseMimeType: "application/json",
                    },
                });

                result = JSON.parse(response.text || "{}");
                console.log(`✅ Gemini Vision 분석 완료 (시도 ${attempt}): ${result.reviews?.length || 0}개 리뷰`);
                break;
            } catch (err: any) {
                console.error(`⚠️ Gemini Vision 실패 (시도 ${attempt}/2):`, err.message);
                if (attempt === 2) {
                    console.error("❌ Gemini Vision 2회 시도 모두 실패");
                    return [];
                }
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!result || !result.reviews || !Array.isArray(result.reviews)) {
            console.warn("⚠️ Gemini Vision 응답에 리뷰 데이터 없음");
            return [];
        }

        // JSON → PostData[] 변환
        const placeName = result.placeName || "알 수 없는 매장";
        const posts: PostData[] = [];

        for (let i = 0; i < Math.min(result.reviews.length, maxReviews); i++) {
            const r = result.reviews[i];
            const rating = r.rating;
            const content = (r.content || "").trim();

            posts.push({
                id: `vision_${platform}_${Date.now()}_${i}`,
                title: `${platformName} 리뷰${rating ? ` ⭐${rating}` : ""} — ${placeName}`,
                content: content || "(텍스트 없는 리뷰)",
                author: r.author || "익명",
                publishedAt: r.date || new Date().toLocaleDateString("ko-KR"),
                url,
                platform: platform === "kakaomap" ? "kakao" : "google",
                source: platform === "kakaomap" ? "kakaomap" : "googleplace",
                engagement: {
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    views: 0,
                },
            });
        }

        return posts;
    }

    /**
     * 브라우저 리소스 정리
     */
    private async closeBrowser(): Promise<void> {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
        } catch { /* 무시 */ }
    }
}

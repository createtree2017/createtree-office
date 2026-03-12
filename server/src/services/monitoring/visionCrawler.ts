import { chromium, type Browser, type Page } from "playwright";
import { GoogleGenAI } from "@google/genai";
import type { PostData } from "./types.js";
import fs from "fs";
import path from "path";

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

            // 디버그: 스크린샷을 /tmp에 저장 (캡처 내용 확인용)
            try {
                const debugPath = `/tmp/debug_${platform}_${Date.now()}.png`;
                fs.writeFileSync(debugPath, screenshot);
                console.log(`🔍 디버그 스크린샷 저장: ${debugPath}`);
            } catch { /* 저장 실패 무시 */ }

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
                return await this.captureGooglePlace(page, url, maxReviews, sortOrder);
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

        // 리뷰 영역까지 스크롤 — 첫 번째 리뷰가 잘리지 않도록 여유를 두고 스크롤
        // 전략: 첫 번째 리뷰 아이템을 찾아서 그 위치에서 위쪽으로 PADDING만큼 offset
        await page.evaluate(() => {
            // 1순위: 개별 리뷰 아이템 (첫 번째 리뷰의 정확한 시작점)
            const firstReview = document.querySelector(
                '.list_review > li, .list_evaluation > li, .cont_review .item_review, .review_list .review_item'
            );
            if (firstReview) {
                const rect = firstReview.getBoundingClientRect();
                const PADDING_TOP = 80; // 첫 리뷰 위에 80px 여유
                window.scrollTo({
                    top: window.scrollY + rect.top - PADDING_TOP,
                    behavior: 'instant',
                });
                return;
            }
            // 2순위: 정렬 버튼 영역 (이 바로 아래가 첫 리뷰)
            const sortArea = document.querySelector('.sort_grade, .btn_sort, .filter_sort');
            if (sortArea) {
                const rect = sortArea.getBoundingClientRect();
                window.scrollTo({
                    top: window.scrollY + rect.top - 30,
                    behavior: 'instant',
                });
                return;
            }
            // 3순위 (폴백): 리뷰 컨테이너 전체
            const reviewSection = document.querySelector('.cont_review, .list_review, #mArticle');
            if (reviewSection) {
                reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
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
     * 구글 플레이스 리뷰 페이지 캡처 (고도화)
     * - 사이드 패널(div[role="main"])만 정조준 캡처
     * - 패널 내부 스크롤로 리뷰 추가 로드
     * - 정렬 변경 (최신순) 지원
     */
    private async captureGooglePlace(page: Page, url: string, maxReviews: number, sortOrder: "latest" | "relevant" = "relevant"): Promise<Buffer | null> {
        console.log("🌍 구글 플레이스 페이지 접속 중...");

        // domcontentloaded로 변경 — networkidle은 구글 맵에서 안정적이지 않음
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        // 구글 맵은 JS 렌더링이 필요하므로 넉넉히 대기
        await page.waitForTimeout(5000);

        // 디버그: 현재 page title과 URL 확인
        const pageTitle = await page.title();
        const currentUrl = page.url();
        console.log(`🔍 [디버그] 페이지 Title: "${pageTitle}", URL: ${currentUrl}`);

        // 쿠키 동의 팝업 닫기 (있으면 — 구글 서비스 첫 진입 시 나타남)
        try {
            const acceptBtn = page.locator('button:has-text("모두 수락"), button:has-text("Accept all"), button:has-text("동의"), form[action*="consent"] button').first();
            if (await acceptBtn.isVisible({ timeout: 3000 })) {
                await acceptBtn.click();
                console.log("🍪 쿠키 동의 팝업 닫기 완료");
                await page.waitForTimeout(2000);
            }
        } catch { /* 무시 */ }

        // 디버그: 로드 직후 전체 페이지 스크린샷 저장
        try {
            const debugInitial = await page.screenshot({ type: "png", fullPage: false });
            fs.writeFileSync(`/tmp/debug_gp_initial_${Date.now()}.png`, debugInitial);
            console.log(`🔍 [디버그] 초기 페이지 스크린샷 저장 완료`);
        } catch { /* 무시 */ }

        // "리뷰" 탭 클릭 시도
        try {
            const reviewTab = page.locator('button[role="tab"][aria-label*="리뷰"], button[role="tab"]:has-text("리뷰")').first();
            if (await reviewTab.isVisible({ timeout: 3000 })) {
                await reviewTab.click();
                console.log("📑 리뷰 탭 클릭 완료");
                await page.waitForTimeout(3000);
            } else {
                console.log("⚠️ 리뷰 탭을 찾지 못함 — URL 파라미터로 리뷰 표시 기대");
            }
        } catch {
            console.log("⚠️ 리뷰 탭 클릭 실패");
        }

        // 디버그: 리뷰 관련 DOM 요소 존재 확인
        const domInfo = await page.evaluate(() => {
            const mainPanel = document.querySelector('div[role="main"]');
            const reviews = document.querySelectorAll('div.jftiEf');
            const scrollable = document.querySelector('div.m6QErb.DxyBCb');
            return {
                hasMainPanel: !!mainPanel,
                mainPanelSize: mainPanel ? { w: mainPanel.clientWidth, h: mainPanel.clientHeight } : null,
                reviewCount: reviews.length,
                hasScrollable: !!scrollable,
                bodyText: document.body.innerText.substring(0, 500), // 페이지 텍스트 앞부분 (리다이렉트/에러 페이지 확인용)
            };
        });
        console.log(`🔍 [디버그] DOM 분석:`, JSON.stringify(domInfo));

        // 정렬 변경 (sortOrder === 'latest'이면 최신순으로)
        if (sortOrder === 'latest') {
            try {
                const sortBtn = page.locator('button[aria-label="리뷰 정렬"], button[aria-label*="정렬"], button:has-text("정렬")').first();
                if (await sortBtn.isVisible({ timeout: 3000 })) {
                    await sortBtn.click();
                    await page.waitForTimeout(1000);
                    const newestOption = page.locator('div[role="menuitemradio"]:nth-child(2), div[role="menuitemradio"]:has-text("최신순")').first();
                    if (await newestOption.isVisible({ timeout: 2000 })) {
                        await newestOption.click();
                        console.log("📅 정렬: 최신순으로 변경");
                        await page.waitForTimeout(2000);
                    }
                }
            } catch {
                console.log("⚠️ 정렬 변경 실패 — 기본 정렬로 진행");
            }
        }

        // 사이드 패널 내부 스크롤로 리뷰 추가 로드
        const scrollSelectors = [
            'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
            'div.m6QErb.DxyBCb',
            'div[role="main"] div.e07Vkf',
            'div[role="main"] div[tabindex="-1"]',
        ];

        if (maxReviews > 5) {
            const scrollCount = Math.ceil(maxReviews / 5);
            console.log(`📜 패널 내부 스크롤 ${scrollCount}회 시도...`);

            for (let i = 0; i < scrollCount; i++) {
                try {
                    const scrollResult = await page.evaluate((selectors) => {
                        for (const sel of selectors) {
                            const el = document.querySelector(sel);
                            if (el && el.scrollHeight > el.clientHeight) {
                                el.scrollTop += 1000;
                                return { scrolled: true, selector: sel };
                            }
                        }
                        // 폴백: 메인 패널 자체를 스크롤
                        const main = document.querySelector('div[role="main"]');
                        if (main) {
                            main.scrollTop += 1000;
                            return { scrolled: true, selector: 'div[role="main"] (fallback)' };
                        }
                        return { scrolled: false, selector: 'none' };
                    }, scrollSelectors);

                    if (!scrollResult.scrolled) {
                        console.log("⚠️ 스크롤 컨테이너를 찾지 못함 — 스크롤 중단");
                        break;
                    }
                    if (i === 0) console.log(`📜 스크롤 컨테이너: ${scrollResult.selector}`);
                    await page.waitForTimeout(1500);
                } catch { break; }
            }

            // 스크롤을 맨 위로 복원
            try {
                await page.evaluate((selectors) => {
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el) { el.scrollTop = 0; break; }
                    }
                }, scrollSelectors);
                await page.waitForTimeout(500);
            } catch { /* 무시 */ }
        }

        // 사이드 패널 요소만 정조준 캡처 (지도 영역 제외)
        // 다단계 셀렉터로 시도
        const panelSelectors = [
            'div[role="main"]',
            'div.m6QErb',
            '#QA0Szd',
        ];

        for (const sel of panelSelectors) {
            try {
                const panel = page.locator(sel).first();
                if (await panel.isVisible({ timeout: 2000 })) {
                    const box = await panel.boundingBox();
                    if (box && box.width > 100 && box.height > 100) {
                        const screenshot = await panel.screenshot({ type: "png" });
                        console.log(`📸 패널 캡처 완료 (셀렉터: ${sel}, ${box.width}×${box.height}px)`);
                        return Buffer.from(screenshot);
                    }
                }
            } catch { continue; }
        }

        console.warn("⚠️ 모든 패널 셀렉터 실패 — 전체 페이지 캡처로 폴백");
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

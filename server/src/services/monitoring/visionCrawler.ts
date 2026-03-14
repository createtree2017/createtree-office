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

            // 브라우저 인스턴스 생성 (headless + stealth 설정)
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                    "--window-size=1920,1080",
                    "--lang=ko-KR",
                ],
            });

            const context = await this.browser.newContext({
                viewport: { width: 1920, height: viewportHeight },
                locale: "ko-KR",
                timezoneId: "Asia/Seoul",
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                // 구글 쿠키 동의를 사전 설정하여 팝업 방지
                extraHTTPHeaders: {
                    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                },
                permissions: ["geolocation"],
                geolocation: { latitude: 37.5665, longitude: 126.978 }, // 서울
            });

            // Stealth: 자동화 감지 우회 스크립트 주입
            await context.addInitScript(() => {
                // navigator.webdriver 속성 제거 (headless 감지 핵심)
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                // Chrome 런타임 시뮬레이션
                (window as any).chrome = {
                    runtime: {},
                    loadTimes: () => ({}),
                    csi: () => ({}),
                    app: {},
                };

                // permissions 쿼리 우회
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters: any) =>
                    parameters.name === 'notifications'
                        ? Promise.resolve({ state: 'denied', addEventListener: () => {}, removeEventListener: () => {} } as any)
                        : originalQuery.call(window.navigator.permissions, parameters);

                // WebGL 벤더/렌더러 위장
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function (param: number) {
                    if (param === 37445) return 'Intel Inc.';
                    if (param === 37446) return 'Intel Iris OpenGL Engine';
                    return getParameter.call(this, param);
                };

                // plugins 배열 위장
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });

                Object.defineProperty(navigator, 'languages', {
                    get: () => ['ko-KR', 'ko', 'en-US', 'en'],
                });
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
        if (sortOrder === 'latest') {
            try {
                const sortBtn = page.locator('button.btn_sort').first();
                if (await sortBtn.isVisible({ timeout: 2000 })) {
                    const currentSortText = await sortBtn.innerText().catch(() => '');
                    if (currentSortText.includes('최신')) {
                        console.log("📅 정렬: 이미 최신 순 — 건너뜀");
                    } else {
                        await sortBtn.click();
                        await page.waitForTimeout(500);
                        const newestOption = page.locator('a.link_sort:has-text("최신 순")').first();
                        if (await newestOption.isVisible({ timeout: 2000 })) {
                            await newestOption.click();
                            console.log("📅 정렬: 최신 순으로 변경");
                        } else {
                            // 옵션 못 찾으면 정렬 버튼 재클릭(토글 닫기)
                            await sortBtn.click();
                            console.log("⚠️ 최신 순 옵션 없음 — 드롭다운 토글 닫기");
                        }
                        await page.waitForTimeout(3000);
                    }
                }
            } catch {
                console.log("⚠️ 정렬 변경 실패 — 기본 정렬로 진행");
            }
        }

        // '더보기' 버튼 클릭 → 리뷰 추가 로드
        if (maxReviews > 5) {
            const clickCount = Math.ceil((maxReviews - 5) / 10);
            console.log(`📜 '더보기' 버튼 ${clickCount}회 클릭 시도...`);
            for (let i = 0; i < clickCount; i++) {
                try {
                    const moreBtn = page.locator('.btn_more, a.link_more, button:has-text("더보기"), a:has-text("더보기")').first();
                    if (await moreBtn.isVisible({ timeout: 2000 })) {
                        await moreBtn.click();
                        await page.waitForTimeout(1500);
                    } else break;
                } catch { break; }
            }
        }

        // ★ 카카오맵: fullPage screenshot 사용
        // element screenshot은 고정 탭 헤더가 첫 번째 리뷰를 가리므로
        // fullPage로 전체를 캡처하고 Gemini가 리뷰만 분석
        console.log("📸 카카오맵 fullPage 캡처 (고정 헤더 가림 방지)");
        const screenshot = await page.screenshot({
            type: "png",
            fullPage: true,
        });
        return Buffer.from(screenshot);
    }

    /**
     * 구글 플레이스 리뷰 캡처 (통합검색 방식)
     * 
     * 전략: 구글 맵 직접 접속 시 headless 감지 → '제한된 뷰' 문제 발생
     * 해결: 구글 통합검색(google.com/search?q={장소명}+리뷰)으로 접속하여
     *       검색 결과에 표시되는 리뷰 모달/패널을 캡처
     */
    private async captureGooglePlace(page: Page, url: string, maxReviews: number, sortOrder: "latest" | "relevant" = "relevant"): Promise<Buffer | null> {
        console.log("🔍 구글 통합검색 리뷰 방식으로 접속...");

        // 1. URL에서 검색어(q=) 파라미터만 추출하여 깨끗한 URL 생성
        //    사용자 URL에는 sxsrf, si, ved 등 세션 토큰이 포함되어 있는데,
        //    이것들은 원래 브라우저 세션에 묶여있어 headless에서 접속 시 구글이 거부함
        let targetUrl: string;
        
        try {
            const urlObj = new URL(url);
            const query = urlObj.searchParams.get("q");
            
            if (query) {
                // q= 파라미터가 있으면 깨끗한 검색 URL로 재구성
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ko`;
                console.log(`🔗 검색어 추출: "${query}" → 클린 URL 생성`);
            } else if (url.includes("google.com/maps")) {
                // 구글 맵 URL → 장소명 추출
                const placeName = this.extractPlaceNameFromUrl(url);
                if (!placeName) {
                    console.error("❌ URL에서 장소명을 추출할 수 없습니다:", url);
                    return null;
                }
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(placeName + " 리뷰")}&hl=ko`;
                console.log(`🔗 맵 URL → 검색어: "${placeName} 리뷰"`);
            } else {
                // 기타 URL 그대로 사용
                targetUrl = url;
                console.log("🔗 URL 그대로 사용");
            }
        } catch {
            targetUrl = url;
            console.log("🔗 URL 파싱 실패 — 그대로 사용");
        }
        
        console.log(`🔗 최종 접속 URL: ${targetUrl}`);
        
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);

        // 디버그: 페이지 정보
        const pageTitle = await page.title();
        console.log(`🔍 [디버그] 페이지 Title: "${pageTitle}"`);

        // 쿠키 동의 팝업 닫기
        try {
            const acceptBtn = page.locator('button:has-text("모두 수락"), button:has-text("Accept all"), button:has-text("동의"), form[action*="consent"] button').first();
            if (await acceptBtn.isVisible({ timeout: 2000 })) {
                await acceptBtn.click();
                console.log("🍪 쿠키 동의 팝업 닫기 완료");
                await page.waitForTimeout(2000);
            }
        } catch { /* 무시 */ }

        // 3. 'Google 리뷰 N개' 링크를 클릭하여 리뷰 모달 오픈
        let reviewModalOpened = false;
        try {
            // 'Google 리뷰 NN개' 또는 'Google 리뷰' 텍스트가 포함된 링크/버튼 클릭
            const reviewLink = page.locator('a:has-text("Google 리뷰"), a:has-text("리뷰 "), a[href*="lrd="]').first();
            if (await reviewLink.isVisible({ timeout: 3000 })) {
                await reviewLink.click();
                console.log("📑 리뷰 모달 오픈 클릭");
                await page.waitForTimeout(3000);
                reviewModalOpened = true;
            }
        } catch {
            console.log("⚠️ 리뷰 링크 클릭 실패");
        }

        // 리뷰 모달이 안 열렸으면 검색 결과 페이지 자체를 캡처 시도
        if (!reviewModalOpened) {
            console.log("⚠️ 리뷰 모달 미오픈 — 검색 결과 페이지 직접 캡처");
        }

        // 4. 정렬 변경 (최신순)
        if (sortOrder === 'latest') {
            try {
                // 통합검색 리뷰에서의 정렬 버튼 — '최신순' 텍스트 버튼
                const latestBtn = page.locator('span:has-text("최신순"), a:has-text("최신순"), button:has-text("최신순")').first();
                if (await latestBtn.isVisible({ timeout: 3000 })) {
                    await latestBtn.click();
                    console.log("📅 정렬: 최신순으로 변경");
                    await page.waitForTimeout(2000);
                }
            } catch {
                console.log("⚠️ 정렬 변경 실패 — 기본 정렬로 진행");
            }
        }

        // 5. 리뷰 모달 내부 스크롤 (무한 스크롤로 리뷰 추가 로드)
        if (maxReviews > 5) {
            const scrollCount = Math.ceil(maxReviews / 3);
            console.log(`📜 리뷰 모달 스크롤 ${scrollCount}회 시도...`);

            for (let i = 0; i < scrollCount; i++) {
                try {
                    const scrollResult = await page.evaluate(() => {
                        // 리뷰 모달/다이얼로그 내부의 스크롤 컨테이너 탐색
                        const selectors = [
                            'div.review-dialog-list',
                            'div[data-async-rclass="review"]',
                            'div.gws-localreviews__general-reviews-block',
                            'div[jsname]',
                        ];
                        for (const sel of selectors) {
                            const el = document.querySelector(sel);
                            if (el && el.scrollHeight > el.clientHeight) {
                                el.scrollTop += 800;
                                return { scrolled: true, selector: sel };
                            }
                        }
                        // 폴백: window 스크롤
                        window.scrollBy(0, 800);
                        return { scrolled: true, selector: 'window (fallback)' };
                    });

                    if (i === 0) console.log(`📜 스크롤 대상: ${scrollResult.selector}`);
                    await page.waitForTimeout(1500);
                } catch { break; }
            }

            // 스크롤 복원
            try {
                await page.evaluate(() => {
                    const selectors = [
                        'div.review-dialog-list',
                        'div[data-async-rclass="review"]', 
                        'div.gws-localreviews__general-reviews-block',
                    ];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el) { el.scrollTop = 0; return; }
                    }
                    window.scrollTo(0, 0);
                });
                await page.waitForTimeout(500);
            } catch { /* 무시 */ }
        }

        // 6. 리뷰 영역 캡처 (모달/패널 정조준)
        // 다양한 셀렉터로 리뷰 컨테이너를 찾아서 캡처
        const reviewContainerSelectors = [
            'div.review-dialog-list',                    // 리뷰 모달 리스트
            'div.gws-localreviews__general-reviews-block', // 리뷰 블록
            'div[data-attrid*="review"]',                // 리뷰 속성 블록
            'div.kp-wholepage',                          // 지식 패널 전체
        ];

        for (const sel of reviewContainerSelectors) {
            try {
                const container = page.locator(sel).first();
                if (await container.isVisible({ timeout: 2000 })) {
                    const box = await container.boundingBox();
                    if (box && box.width > 200 && box.height > 200) {
                        const screenshot = await container.screenshot({ type: "png" });
                        console.log(`📸 리뷰 영역 캡처 완료 (셀렉터: ${sel}, ${Math.round(box.width)}×${Math.round(box.height)}px)`);
                        return Buffer.from(screenshot);
                    }
                }
            } catch { continue; }
        }

        // 폴백: 전체 페이지 캡처
        console.log("⚠️ 리뷰 컨테이너 미발견 — 전체 페이지 캡처로 폴백");
        const screenshot = await page.screenshot({ type: "png", fullPage: false });
        return Buffer.from(screenshot);
    }

    /**
     * 구글 맵 URL에서 장소명 추출
     * URL 패턴: /maps/place/{장소명}/... 또는 /maps/place/{URL인코딩된_장소명}/...
     */
    private extractPlaceNameFromUrl(url: string): string | null {
        try {
            // /maps/place/ 뒤의 장소명 추출
            const placeMatch = url.match(/\/maps\/place\/([^\/\?]+)/);
            if (placeMatch) {
                return decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
            }

            // URL에 maps/place가 없는 경우 (직접 검색 URL일 수 있음)
            const searchMatch = url.match(/[?&]q=([^&]+)/);
            if (searchMatch) {
                return decodeURIComponent(searchMatch[1]).replace(/\+/g, ' ');
            }

            return null;
        } catch {
            return null;
        }
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

중요: 이미지의 맨 위에 보이는 첫 번째 리뷰부터, 아래로 순서대로 모든 리뷰를 빠짐없이 추출하세요.
정렬 버튼, 프로필 아이콘 영역은 리뷰가 아닙니다 — 그 아래에 별점(★)과 날짜, 본문이 함께 있는 것이 리뷰입니다.

아래 JSON 형식으로 정확히 추출하세요:

{
  "placeName": "매장 이름 (보이면)",
  "totalReviewCount": "전체 리뷰 수 (숫자, 보이면)",
  "averageRating": 4.5,
  "reviews": [
    {
      "position": 1,
      "author": "작성자 닉네임",
      "rating": 5,
      "content": "리뷰 본문 전체 텍스트",
      "date": "2026.03.10",
      "hasPhoto": false
    }
  ]
}

반드시 지켜야 할 규칙:
1. 이미지에서 맨 위에 보이는 첫 번째 리뷰(position=1)를 절대 건너뛰지 마세요. 이것이 가장 중요합니다.
2. 이미지에 실제로 보이는 리뷰만 추출하세요 (절대 추측하거나 지어내지 마세요)
3. 별점은 채워진 별(★)의 개수를 정확히 세세요. 카카오맵은 별 1~5개로 표시됩니다.
4. 리뷰가 전혀 없으면 reviews를 빈 배열로 반환
5. 최대 ${maxReviews}개까지만 추출
6. 날짜가 상대적(예: "2일 전", "1주 전")이면 그대로 기재
7. position은 이미지 위에서부터 순서대로 1, 2, 3... 으로 매기세요`;

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

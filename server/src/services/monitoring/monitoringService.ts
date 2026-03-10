import { db } from "../../db/index.js";
import { monitoringTemplates, monitoringResults, clients } from "../../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { NaverCollector } from "./naverCollector.js";
import { ContentCrawler } from "./contentCrawler.js";
import { PlaceCrawler } from "./placeCrawler.js";
import { SentimentAnalyzer } from "./sentimentAnalyzer.js";
import { ReportGenerator } from "./reportGenerator.js";
import type { MonitoringTemplate, MonitoringResult, CrawlOptions } from "./types.js";
import { MONITORING_STATUS } from "./types.js";

/**
 * 모니터링 서비스 - 워크플로우 오케스트레이터
 * 수집 → 분석 → 저장 → 보고서 생성 파이프라인
 */
export class MonitoringService {
    private naverCollector: NaverCollector;
    private contentCrawler: ContentCrawler;
    private placeCrawler: PlaceCrawler;
    private analyzer: SentimentAnalyzer;
    private reportGenerator: ReportGenerator;

    constructor() {
        this.naverCollector = new NaverCollector();
        this.contentCrawler = new ContentCrawler();
        this.placeCrawler = new PlaceCrawler();
        this.analyzer = new SentimentAnalyzer();
        this.reportGenerator = new ReportGenerator();
    }

    // ===== Template CRUD =====

    async getTemplates(clientId?: number | null) {
        if (clientId) {
            return db.select().from(monitoringTemplates).where(eq(monitoringTemplates.clientId, clientId)).orderBy(desc(monitoringTemplates.createdAt));
        }
        return db.select().from(monitoringTemplates).orderBy(desc(monitoringTemplates.createdAt));
    }

    async getTemplate(id: number) {
        const [template] = await db.select().from(monitoringTemplates).where(eq(monitoringTemplates.id, id));
        return template || null;
    }

    async createTemplate(data: any) {
        const [created] = await db.insert(monitoringTemplates).values(data).returning();
        return created;
    }

    async updateTemplate(id: number, data: any) {
        const [updated] = await db.update(monitoringTemplates).set({ ...data, updatedAt: new Date() }).where(eq(monitoringTemplates.id, id)).returning();
        return updated;
    }

    async deleteTemplate(id: number) {
        await db.delete(monitoringResults).where(eq(monitoringResults.templateId, id));
        await db.delete(monitoringTemplates).where(eq(monitoringTemplates.id, id));
    }

    // ===== Results =====

    async getResults(clientId?: number | null, templateId?: number) {
        let conditions = [];
        if (clientId) conditions.push(eq(monitoringResults.clientId, clientId));
        if (templateId) conditions.push(eq(monitoringResults.templateId, templateId));

        if (conditions.length > 0) {
            return db.select().from(monitoringResults).where(and(...conditions)).orderBy(desc(monitoringResults.createdAt));
        }
        return db.select().from(monitoringResults).orderBy(desc(monitoringResults.createdAt));
    }

    async getResult(id: number) {
        const [result] = await db.select().from(monitoringResults).where(eq(monitoringResults.id, id));
        return result || null;
    }

    // ===== 모니터링 실행 =====

    async executeMonitoring(templateId: number, userId: number): Promise<number> {
        const template = await this.getTemplate(templateId);
        if (!template) throw new Error("템플릿을 찾을 수 없습니다.");

        // 결과 레코드 생성 (즉시 응답용)
        const [result] = await db.insert(monitoringResults).values({
            templateId: template.id,
            clientId: template.clientId,
            status: "RUNNING",
            createdBy: userId,
        }).returning();

        // 비동기 실행
        this.processMonitoring(template as MonitoringTemplate, result.id).catch((err) => {
            console.error("모니터링 비동기 실행 오류:", err);
        });

        return result.id;
    }

    private async processMonitoring(template: MonitoringTemplate, resultId: number): Promise<void> {
        const startTime = Date.now();

        try {
            // Step 1: 수집
            console.log(`🔍 수집 시작 - ${template.name}`);
            const crawlOptions: CrawlOptions = {
                searchType: template.searchType as "latest" | "accuracy",
                dateRange: template.dateRange,
                collectCount: template.collectCount,
                scope: template.monitoringScope,
            };

            let posts = await this.naverCollector.crawlSearch(template.keywords, crawlOptions);
            console.log(`✅ API 수집 완료 - ${posts.length}개 게시글`);

            // Step 1.5: 콘텐츠 보강 크롤링 (crawlingMethod가 hybrid/unified일 때)
            if (template.crawlingMethod !== 'api' && posts.length > 0) {
                console.log(`🔄 콘텐츠 보강 크롤링 시작 (${template.crawlingMethod} 모드)`);
                const maxCrawl = Math.min(posts.length, 20);
                const toCrawl = posts.slice(0, maxCrawl);
                const enriched = await this.contentCrawler.enrichPosts(toCrawl);
                posts = [...enriched, ...posts.slice(maxCrawl)];
                console.log(`✅ 콘텐츠 보강 완료 - ${enriched.length}개 보강됨`);
            }

            // Step 1.6: 플레이스 리뷰 크롤링 (targetPlaces가 있을 때)
            if (template.targetPlaces && template.targetPlaces.length > 0) {
                console.log(`🏥 플레이스 크롤링 시작 - ${template.targetPlaces.length}개 플레이스`);
                try {
                    for (const place of template.targetPlaces) {
                        const placeId = this.extractPlaceId(place.url, place.platform);
                        if (!placeId) { console.warn(`⚠️ 플레이스 ID 추출 실패: ${place.url}`); continue; }

                        let reviews: any[] = [];
                        if (place.platform === 'naverplace') {
                            reviews = await this.placeCrawler.crawlNaverPlace(placeId, template.collectCount);
                        } else if (place.platform === 'kakaomap') {
                            reviews = await this.placeCrawler.crawlKakaoMap(placeId, template.collectCount);
                        }
                        posts = [...posts, ...reviews];
                        console.log(`✅ ${place.platform} 리뷰 ${reviews.length}개 수집`);
                    }
                } catch (placeErr) {
                    console.error('⚠️ 플레이스 크롤링 실패 (API 결과는 유지):', placeErr);
                } finally {
                    await this.placeCrawler.close();
                }
            }

            // Step 1.7: 지정 카페 크롤링 (cafe_specific scope + targetCafes 있을 때)
            if (template.monitoringScope.includes('cafe_specific') && template.targetCafes && template.targetCafes.length > 0) {
                console.log(`☕ 지정 카페 크롤링 시작 - ${template.targetCafes.length}개 카페`);
                try {
                    for (const cafe of template.targetCafes) {
                        const cafeId = this.extractCafeId(cafe.url);
                        if (!cafeId) { console.warn(`⚠️ 카페 ID 추출 실패: ${cafe.url}`); continue; }
                        // 네이버 카페 내 검색 API 활용
                        for (const keyword of template.keywords) {
                            const cafeSearchUrl = `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent(keyword)}&display=${template.collectCount}&sort=date&filter=cafe_url:${cafeId}`;
                            // API 기반이므로 naverCollector로 처리 (향후 확장)
                        }
                    }
                } catch (cafeErr) {
                    console.error('⚠️ 지정 카페 크롤링 실패:', cafeErr);
                }
            }

            if (posts.length === 0) {
                await db.update(monitoringResults).set({
                    status: "COMPLETED",
                    posts: [],
                    summary: "수집된 게시글이 없습니다.",
                    executionTimeMs: Date.now() - startTime,
                    updatedAt: new Date(),
                }).where(eq(monitoringResults.id, resultId));
                return;
            }

            // Step 2: AI 감성 분석
            console.log(`🤖 AI 분석 시작`);
            const analysis = await this.analyzer.analyze(posts, template);
            console.log(`✅ 분석 완료 - 전체 감성: ${analysis.overall_sentiment}`);

            // Step 3: 보고서 생성 및 드라이브 업로드
            let driveFileId: string | null = null;
            try {
                // 거래처 정보 조회
                const [client] = await db.select().from(clients).where(eq(clients.id, template.clientId));
                if (client?.driveFolderId) {
                    driveFileId = await this.reportGenerator.generateAndUpload(template, posts, analysis, client);
                    console.log(`📄 보고서 드라이브 업로드 완료: ${driveFileId}`);
                }
            } catch (reportErr) {
                console.error("보고서 생성/업로드 실패 (결과는 정상 저장):", reportErr);
            }

            // Step 4: 결과 저장
            await db.update(monitoringResults).set({
                status: "COMPLETED",
                posts: posts,
                statistics: analysis as any,
                summary: analysis.summary,
                executionTimeMs: Date.now() - startTime,
                driveFileId,
                updatedAt: new Date(),
            }).where(eq(monitoringResults.id, resultId));

            console.log(`🎉 모니터링 완료 - ${template.name} (${Date.now() - startTime}ms)`);
        } catch (error) {
            console.error(`❌ 모니터링 실패 - ${template.name}:`, error);
            await db.update(monitoringResults).set({
                status: "FAILED",
                errorLog: {
                    message: error instanceof Error ? error.message : "알 수 없는 오류",
                    timestamp: new Date().toISOString(),
                },
                executionTimeMs: Date.now() - startTime,
                updatedAt: new Date(),
            }).where(eq(monitoringResults.id, resultId));
        }
    }

    /** URL에서 플레이스 ID 추출 */
    private extractPlaceId(url: string, platform: string): string | null {
        try {
            if (platform === 'naverplace') {
                // https://map.naver.com/p/entry/place/1234567 또는 https://m.place.naver.com/restaurant/1234567
                const match = url.match(/(?:place|restaurant|hospital|beauty)\/(\d+)/);
                return match ? match[1] : null;
            }
            if (platform === 'kakaomap') {
                // https://place.map.kakao.com/1234567
                const match = url.match(/kakao\.com\/(\d+)/);
                return match ? match[1] : null;
            }
            return null;
        } catch { return null; }
    }

    /** URL에서 카페 ID 추출 */
    private extractCafeId(url: string): string | null {
        try {
            // https://cafe.naver.com/cafename
            const match = url.match(/cafe\.naver\.com\/([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        } catch { return null; }
    }
}

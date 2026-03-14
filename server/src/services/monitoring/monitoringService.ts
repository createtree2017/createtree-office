import { db } from "../../db/index.js";
import { monitoringTemplates, monitoringResults, clients } from "../../db/schema.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { NaverCollector } from "./naverCollector.js";
import { ContentCrawler } from "./contentCrawler.js";
import { PlaceCrawler } from "./placeCrawler.js";
import { GooglePlaceCollector } from "./googlePlaceCollector.js";
import { VisionCrawler } from "./visionCrawler.js";
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
    private googlePlaceCollector: GooglePlaceCollector;
    private visionCrawler: VisionCrawler;
    private analyzer: SentimentAnalyzer;
    private reportGenerator: ReportGenerator;

    constructor() {
        this.naverCollector = new NaverCollector();
        this.contentCrawler = new ContentCrawler();
        this.placeCrawler = new PlaceCrawler();
        this.googlePlaceCollector = new GooglePlaceCollector();
        this.visionCrawler = new VisionCrawler();
        this.analyzer = new SentimentAnalyzer();
        this.reportGenerator = new ReportGenerator();
    }

    // ===== Template CRUD =====

    async getTemplates(clientId?: number | null) {
        const query = db
            .select({
                id: monitoringTemplates.id,
                name: monitoringTemplates.name,
                templateType: monitoringTemplates.templateType,
                clientId: monitoringTemplates.clientId,
                clientName: clients.name,
                keywords: monitoringTemplates.keywords,
                monitoringScope: monitoringTemplates.monitoringScope,
                isActive: monitoringTemplates.isActive,
                collectCount: monitoringTemplates.collectCount,
                searchType: monitoringTemplates.searchType,
                dateRange: monitoringTemplates.dateRange,
                crawlingMethod: monitoringTemplates.crawlingMethod,
                analysisMode: monitoringTemplates.analysisMode,
                scheduleEnabled: monitoringTemplates.scheduleEnabled,
                scheduleCron: monitoringTemplates.scheduleCron,
                scheduleLastRunAt: monitoringTemplates.scheduleLastRunAt,
                targetPlaces: monitoringTemplates.targetPlaces,
                targetCafes: monitoringTemplates.targetCafes,
                notifyEnabled: monitoringTemplates.notifyEnabled,
                notifyChannels: monitoringTemplates.notifyChannels,
                createdAt: monitoringTemplates.createdAt,
                updatedAt: monitoringTemplates.updatedAt,
            })
            .from(monitoringTemplates)
            .leftJoin(clients, eq(monitoringTemplates.clientId, clients.id))
            .orderBy(desc(monitoringTemplates.createdAt));

        if (clientId) {
            return query.where(eq(monitoringTemplates.clientId, clientId));
        }
        return query;
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
        // monitoringResults, notificationLogs의 templateId는 onDelete: "set null"로 설정되어
        // 템플릿 삭제 시 자동으로 null로 변경됨 → 결과물은 보존
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

    async deleteResults(ids: number[]) {
        await db.delete(monitoringResults).where(inArray(monitoringResults.id, ids));
    }

    // ===== 모니터링 실행 =====

    async executeMonitoring(templateId: number, userId: number): Promise<number> {
        const template = await this.getTemplate(templateId);
        if (!template) throw new Error("템플릿을 찾을 수 없습니다.");

        // 결과 레코드 생성 (즉시 응답용)
        const [result] = await db.insert(monitoringResults).values({
            templateId: template.id,
            templateName: template.name,
            clientId: template.clientId,
            status: "RUNNING",
            createdBy: userId,
        }).returning();

        // 비동기 실행 — Promise를 확실히 catch하여 unhandled rejection 방지
        const safeProcess = async () => {
            try {
                await this.processMonitoring(template as MonitoringTemplate, result.id);
            } catch (err) {
                console.error(`❌ 모니터링 비동기 실행 오류 (템플릿 #${templateId}):`, err instanceof Error ? err.message : err);
                // 실패 시 결과 상태를 FAILED로 확실히 업데이트
                try {
                    await db.update(monitoringResults).set({
                        status: "FAILED",
                        errorLog: { message: err instanceof Error ? err.message : "알 수 없는 오류", timestamp: new Date().toISOString() },
                        updatedAt: new Date(),
                    }).where(eq(monitoringResults.id, result.id));
                } catch { /* DB 업데이트 실패해도 무시 */ }
            }
        };
        safeProcess();

        return result.id;
    }

    private async processMonitoring(template: MonitoringTemplate, resultId: number): Promise<void> {
        const startTime = Date.now();
        const isPlace = (template as any).templateType === 'place';

        try {
            let posts: any[] = [];

            if (isPlace) {
                // ===== 플레이스 전용 처리 =====
                console.log(`🏥 플레이스 모니터링 시작 - ${template.name}`);
                const targetPlaces = (template as any).targetPlaces;

                if (!targetPlaces || targetPlaces.length === 0) {
                    console.warn('⚠️ targetPlaces가 비어있습니다.');
                } else {
                    try {
                        for (const place of targetPlaces) {
                            let reviews: any[] = [];

                            if (place.platform === 'googleplace') {
                                // 구글 플레이스 — Outscraper API (안정적, 봇 감지 없음)
                                const googleQuery = this.googlePlaceCollector.extractGoogleQuery(place.url);
                                if (!googleQuery) {
                                    console.warn(`⚠️ 구글 플레이스 URL 파싱 실패: ${place.url}`);
                                    continue;
                                }
                                console.log(`🔍 구글 플레이스 수집 (Outscraper): ${googleQuery}`);
                                reviews = await this.googlePlaceCollector.crawlGooglePlace(googleQuery, template.collectCount);

                            } else if (place.platform === 'kakaomap') {
                                // 카카오맵 — 비주얼 스크래핑 (Playwright + Gemini Vision)
                                const sortOrder = (place.sortOrder === 'latest' ? 'latest' : 'relevant') as "latest" | "relevant";
                                console.log(`📸 카카오맵 비주얼 스크래핑: ${place.url} (정렬: ${sortOrder})`);
                                reviews = await this.visionCrawler.crawlByVision(
                                    place.url, 'kakaomap', template.collectCount, sortOrder
                                );

                            } else if (place.platform === 'naverplace') {
                                const placeId = this.extractPlaceId(place.url, place.platform);
                                console.log(`🔍 플레이스 ID 추출: ${place.url} → ${placeId} (${place.platform})`);
                                if (!placeId) { console.warn(`⚠️ 플레이스 ID 추출 실패: ${place.url}`); continue; }
                                reviews = await this.placeCrawler.crawlNaverPlace(placeId, template.collectCount);
                            }

                            posts = [...posts, ...reviews];
                            console.log(`✅ ${place.platform} 리뷰 ${reviews.length}개 수집`);
                        }
                    } catch (placeErr) {
                        console.error('⚠️ 플레이스 크롤링 실패:', placeErr);
                    } finally {
                        await this.placeCrawler.close();
                    }
                }
            } else {
                // ===== 통합검색(integrated) 처리 =====
                console.log(`🔍 통합검색 수집 시작 - ${template.name}`);
                const crawlOptions: CrawlOptions = {
                    searchType: template.searchType as "latest" | "accuracy",
                    dateRange: template.dateRange,
                    collectCount: template.collectCount,
                    scope: template.monitoringScope,
                };

                posts = await this.naverCollector.crawlSearch(template.keywords ?? [], crawlOptions);
                console.log(`✅ API 수집 완료 - ${posts.length}개 게시글`);

                // 콘텐츠 보강 크롤링 (crawlingMethod가 hybrid일 때)
                if (template.crawlingMethod !== 'api' && posts.length > 0) {
                    console.log(`🔄 콘텐츠 보강 크롤링 시작 (${template.crawlingMethod} 모드)`);
                    const maxCrawl = Math.min(posts.length, 20);
                    const toCrawl = posts.slice(0, maxCrawl);
                    const enriched = await this.contentCrawler.enrichPosts(toCrawl);
                    posts = [...enriched, ...posts.slice(maxCrawl)];
                    console.log(`✅ 콘텐츠 보강 완료 - ${enriched.length}개 보강됨`);
                }

                // 지정 카페 크롤링 (cafe_specific scope + targetCafes 있을 때)
                const targetCafes = (template as any).targetCafes;
                if (template.monitoringScope.includes('cafe_specific') && targetCafes && targetCafes.length > 0) {
                    console.log(`☕ 지정 카페 크롤링 시작 - ${targetCafes.length}개 카페`);
                    try {
                        for (const cafe of targetCafes) {
                            const cafeId = this.extractCafeId(cafe.url);
                            if (!cafeId) { console.warn(`⚠️ 카페 ID 추출 실패: ${cafe.url}`); continue; }
                            for (const keyword of (template.keywords ?? [])) {
                                const cafeSearchUrl = `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent(keyword)}&display=${template.collectCount}&sort=date&filter=cafe_url:${cafeId}`;
                                // API 기반이므로 naverCollector로 처리 (향후 확장)
                            }
                        }
                    } catch (cafeErr) {
                        console.error('⚠️ 지정 카페 크롤링 실패:', cafeErr);
                    }
                }
            }

            if (posts.length === 0) {
                console.warn(`⚠️ 수집된 게시글 없음 - templateType: ${(template as any).templateType}`);
                await db.update(monitoringResults).set({
                    status: "COMPLETED",
                    posts: [],
                    summary: isPlace
                        ? "플레이스 리뷰 수집 결과가 없습니다. 플레이스 URL을 확인하세요."
                        : "수집된 게시글이 없습니다.",
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

            // Step 5: Telegram 알림 발송
            try {
                if ((template as any).notifyEnabled) {
                    const { telegramService } = await import("../notification/telegramService.js");
                    await telegramService.sendMonitoringAlert(
                        template.clientId,
                        template.name,
                        posts.length,
                        analysis.summary,
                        resultId,
                        template.id,
                        analysis.sentiment_distribution,
                    );
                }
            } catch (notifyErr) {
                console.error("알림 발송 실패 (결과는 정상 저장):", notifyErr);
            }
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
                // 패턴 1: https://map.naver.com/p/entry/place/13228
                // 패턴 2: https://m.place.naver.com/restaurant/13228
                // 패턴 3: https://map.naver.com/v5/entry/place/13228
                const patterns = [
                    /\/(?:place|entry\/place)\/(\d+)/,
                    /(?:restaurant|hospital|beauty|cafe|hair)\/(\d+)/,
                    /naver\.com.*?\/(\d{5,})/,
                ];
                for (const pat of patterns) {
                    const match = url.match(pat);
                    if (match) return match[1];
                }
                return null;
            }
            if (platform === 'kakaomap') {
                // 패턴 1: https://place.map.kakao.com/1234567
                // 패턴 2: https://map.kakao.com/?itemId=1234567
                const patterns = [
                    /kakao\.com\/(\d+)/,
                    /itemId=(\d+)/,
                ];
                for (const pat of patterns) {
                    const match = url.match(pat);
                    if (match) return match[1];
                }
                return null;
            }
            return null;
        } catch { return null; }
    }

    /** URL에서 카페 ID 추출 */
    private extractCafeId(url: string): string | null {
        try {
            const match = url.match(/cafe\.naver\.com\/([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        } catch { return null; }
    }
}


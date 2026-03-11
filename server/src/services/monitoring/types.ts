// ===== 모니터링 시스템 공유 타입 =====

/** 수집된 게시글 데이터 */
export interface PostData {
    id: string;
    title: string;
    content: string;
    author: string;
    publishedAt: string;   // 리뷰 작성일 (created)
    visitedAt?: string;    // 방문일 (visitedDate) - 플레이스 전용
    url: string;
    platform: "naver" | "google" | "daum" | "kakao";  // google = 구글 플레이스(Outscraper)
    source?: "blog" | "cafe" | "cafe_specific" | "news" | "place" | "naverplace" | "kakaomap" | "googleplace";
    sentiment?: "positive" | "neutral" | "negative";
    sentimentScore?: number;
    comments?: string[];
    engagement?: {
        likes: number;
        comments: number;
        shares: number;
        views?: number;
    };
}

/** 감성 분석 통계 */
export interface SentimentStats {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    percentage: {
        positive: number;
        neutral: number;
        negative: number;
    };
}

/** AI 분석 결과 */
export interface AnalysisResult {
    overall_sentiment: "positive" | "neutral" | "negative";
    sentiment_distribution: SentimentStats;
    key_topics: string[];
    positive_points: string[];
    improvement_areas: string[];
    summary: string;
    analysis_method: "gemini" | "fallback";
    confidence_score?: number;
    processing_stats: {
        total_posts: number;
        processed_posts: number;
    };
    analyzed_posts?: any[];
}

/** 크롤링 옵션 */
export interface CrawlOptions {
    searchType: "latest" | "accuracy";
    dateRange: number;
    collectCount: number;
    scope: string[];
    maxPosts?: number;
}

/** 모니터링 템플릿 (DB 타입 매핑) */
export interface MonitoringTemplate {
    id: number;
    name: string;
    templateType: string; // 'integrated' | 'place'
    clientId: number;
    keywords: string[] | null;
    monitoringScope: string[];
    searchType: string;
    dateRange: number;
    collectCount: number;
    crawlingMethod: string;
    targetPlaces: Array<{ platform: string; url: string; name?: string }> | null;
    targetCafes: Array<{ url: string; name?: string }> | null;
    scheduleEnabled: boolean;
    scheduleCron: string | null;
    scheduleLastRunAt: Date | null;
    isActive: boolean;
    analysisMode: string;
    createdBy: number | null;
    createdAt: Date;
    updatedAt: Date;
}

/** 모니터링 결과 (DB 타입 매핑) */
export interface MonitoringResult {
    id: number;
    templateId: number;
    clientId: number;
    status: string;
    posts: PostData[] | null;
    statistics: AnalysisResult | null;
    summary: string | null;
    executionTimeMs: number | null;
    errorLog: any | null;
    retryCount: number;
    driveFileId: string | null;
    createdBy: number | null;
    createdAt: Date;
    updatedAt: Date;
}

/** 모니터링 상수 */
export const MONITORING_STATUS = {
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
} as const;

export const SENTIMENT_KEYWORDS = {
    positive: [
        "좋다", "만족", "추천", "친절", "깨끗", "전문적", "신뢰",
        "훌륭", "완벽", "최고", "우수", "탁월", "감사", "편안",
    ],
    neutral: [
        "보통", "그럭저럭", "평범", "무난", "괜찮", "일반", "적당",
    ],
    negative: [
        "나쁘다", "불만", "실망", "불친절", "더럽다", "비전문적", "불신",
        "최악", "불만족", "짜증", "문제", "별로", "비추",
    ],
} as const;

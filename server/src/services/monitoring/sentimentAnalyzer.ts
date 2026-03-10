import { GoogleGenAI } from "@google/genai";
import type { PostData, AnalysisResult, MonitoringTemplate } from "./types.js";
import { SENTIMENT_KEYWORDS } from "./types.js";

/**
 * AI 감성 분석기
 * 전체 게시글을 1회 Gemini 호출로 종합 분석
 */
export class SentimentAnalyzer {
    private gemini: GoogleGenAI;

    constructor() {
        this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    }

    async analyze(posts: PostData[], template: MonitoringTemplate): Promise<AnalysisResult> {
        console.log(`🔍 AI 분석 시작 - 템플릿: ${template.name}, 게시글: ${posts.length}건`);

        if (process.env.GEMINI_API_KEY && posts.length > 0) {
            try {
                return await this.geminiAnalysis(posts, template);
            } catch (error) {
                console.error("❌ Gemini 분석 실패, 키워드 기반 분석으로 전환:", error);
                return this.fallbackAnalysis(posts, template);
            }
        }

        return this.fallbackAnalysis(posts, template);
    }

    /**
     * Gemini 1회 호출로 전체 게시글 종합 분석
     * - 각 게시글 감성 판정 (긍정/중립/부정)
     * - 종합 서술식 의견
     */
    private async geminiAnalysis(posts: PostData[], template: MonitoringTemplate): Promise<AnalysisResult> {
        // 게시글 데이터를 프롬프트용 텍스트로 변환
        const postsText = posts.map((p, i) => {
            const content = (p.content || "").trim();
            return `[${i + 1}] 작성자: ${p.author} | 내용: ${content || "(이미지 전용 리뷰, 텍스트 없음)"}`;
        }).join("\n");

        const prompt = `당신은 온라인 평판 모니터링 전문 분석가입니다.
아래는 "${template.name}"에 대한 총 ${posts.length}개의 리뷰/게시글입니다.

===== 게시글 목록 =====
${postsText}
========================

다음 JSON 형식으로 종합 분석 결과를 응답해주세요:
{
  "sentiments": [
    {"index": 1, "sentiment": "positive|neutral|negative", "confidence": 0.0-1.0},
    {"index": 2, "sentiment": "positive|neutral|negative", "confidence": 0.0-1.0}
  ],
  "key_topics": ["주요 토픽1", "주요 토픽2", "주요 토픽3"],
  "positive_points": ["긍정적 요소1", "긍정적 요소2"],
  "improvement_areas": ["개선이 필요한 점1", "개선이 필요한 점2"],
  "summary": "여기에 전문 분석가의 관점에서 종합 의견을 서술식으로 작성 (200~400자). 수집된 리뷰의 전반적인 경향, 특징적인 패턴, 주목할 만한 점, 그리고 비즈니스 관점에서의 시사점을 포함해주세요."
}

분석 시 주의사항:
- 전체 맥락과 뉘앙스를 고려하여 감성을 판단하세요
- 이미지 전용 리뷰(텍스트 없음)는 "neutral"로 처리하세요
- summary는 반드시 서술식 문장으로 전문가 보고서 톤으로 작성하세요
- 모니터링 키워드: ${(template.keywords ?? []).join(", ") || "없음"}`;

        console.log(`📊 Gemini 종합 분석 호출 중 (${posts.length}개 게시글)...`);

        let result: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await this.gemini.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: {
                        temperature: 0.4,
                        maxOutputTokens: 65536,
                        responseMimeType: "application/json",
                    },
                });
                result = JSON.parse(response.text || "{}");
                console.log(`✅ Gemini 종합 분석 완료 (시도 ${attempt})`);
                break;
            } catch (parseErr) {
                console.error(`⚠️ Gemini 응답 JSON 파싱 실패 (시도 ${attempt}/2):`, parseErr);
                if (attempt === 2) throw parseErr;
                await new Promise(r => setTimeout(r, 1000));  // 1초 대기 후 재시도
            }
        }

        // 개별 감성 결과를 posts에 반영
        const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };

        if (result.sentiments && Array.isArray(result.sentiments)) {
            for (const s of result.sentiments) {
                const idx = s.index - 1;
                if (idx >= 0 && idx < posts.length) {
                    const sentiment = s.sentiment as "positive" | "neutral" | "negative";
                    posts[idx].sentiment = sentiment;
                    posts[idx].sentimentScore = s.confidence || 0.5;
                    sentimentCounts[sentiment]++;
                }
            }
        }

        // 감성 미할당 게시글 처리 (JSON 파싱 누락 시)
        for (const post of posts) {
            if (!post.sentiment) {
                const fallback = this.analyzeSinglePostKeywords(post);
                post.sentiment = fallback;
                post.sentimentScore = 0.5;
                sentimentCounts[fallback]++;
            }
        }

        const total = posts.length;

        return {
            overall_sentiment: this.getDominant(sentimentCounts),
            sentiment_distribution: {
                total,
                positive: sentimentCounts.positive,
                neutral: sentimentCounts.neutral,
                negative: sentimentCounts.negative,
                percentage: {
                    positive: total > 0 ? Math.round((sentimentCounts.positive / total) * 100) : 0,
                    neutral: total > 0 ? Math.round((sentimentCounts.neutral / total) * 100) : 0,
                    negative: total > 0 ? Math.round((sentimentCounts.negative / total) * 100) : 0,
                },
            },
            key_topics: (result.key_topics || []).slice(0, 10),
            positive_points: (result.positive_points || []).slice(0, 10),
            improvement_areas: (result.improvement_areas || []).slice(0, 10),
            summary: result.summary || this.fallbackSummary(sentimentCounts, total, template),
            analysis_method: "gemini",
            processing_stats: { total_posts: total, processed_posts: total },
        };
    }

    // ===== Fallback (키워드 기반 분석) =====

    private fallbackSummary(counts: { positive: number; neutral: number; negative: number }, total: number, template: MonitoringTemplate): string {
        const dominant = this.getDominant(counts);
        const pct = total > 0 ? Math.round((counts[dominant] / total) * 100) : 0;
        const label = { positive: "긍정적", neutral: "중립적", negative: "부정적" }[dominant];
        return `${template.name} 관련 ${total}개 게시글 분석 결과, ${label} 반응이 ${pct}%로 가장 높게 나타났습니다.`;
    }

    private fallbackAnalysis(posts: PostData[], template: MonitoringTemplate): AnalysisResult {
        const counts = { positive: 0, neutral: 0, negative: 0 };

        posts.forEach((post) => {
            const sentiment = this.analyzeSinglePostKeywords(post);
            counts[sentiment]++;
            post.sentiment = sentiment;
            post.sentimentScore = 0.5;
        });

        const total = posts.length;
        return {
            overall_sentiment: this.getDominant(counts),
            sentiment_distribution: {
                total, ...counts,
                percentage: {
                    positive: total > 0 ? Math.round((counts.positive / total) * 100) : 0,
                    neutral: total > 0 ? Math.round((counts.neutral / total) * 100) : 0,
                    negative: total > 0 ? Math.round((counts.negative / total) * 100) : 0,
                },
            },
            key_topics: (template.keywords ?? []).slice(0, 5),
            positive_points: [],
            improvement_areas: [],
            summary: this.fallbackSummary(counts, total, template),
            analysis_method: "fallback",
            processing_stats: { total_posts: total, processed_posts: total },
        };
    }

    private analyzeSinglePostKeywords(post: PostData): "positive" | "neutral" | "negative" {
        const text = (post.title + " " + post.content).toLowerCase();
        const pos = SENTIMENT_KEYWORDS.positive.filter((k) => text.includes(k)).length;
        const neg = SENTIMENT_KEYWORDS.negative.filter((k) => text.includes(k)).length;
        if (pos > neg && pos > 0) return "positive";
        if (neg > pos && neg > 0) return "negative";
        return "neutral";
    }

    private getDominant(c: { positive: number; neutral: number; negative: number }): "positive" | "neutral" | "negative" {
        if (c.positive > c.neutral && c.positive > c.negative) return "positive";
        if (c.negative > c.neutral && c.negative > c.positive) return "negative";
        return "neutral";
    }
}

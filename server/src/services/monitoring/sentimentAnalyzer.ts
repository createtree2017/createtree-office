import { GoogleGenAI } from "@google/genai";
import type { PostData, AnalysisResult, MonitoringTemplate } from "./types.js";
import { SENTIMENT_KEYWORDS } from "./types.js";

/**
 * AI 감성 분석기
 * CMP MonitoringAnalyzer를 Gemini 2.5 Flash 기반으로 리팩토링
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

    private async geminiAnalysis(posts: PostData[], template: MonitoringTemplate): Promise<AnalysisResult> {
        const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
        const keyTopics = new Set<string>();
        const positivePoints: string[] = [];
        const improvementAreas: string[] = [];
        const analyzedPosts: any[] = [];

        // 배치 분석 (5개씩)
        const batchSize = 5;
        for (let i = 0; i < posts.length; i += batchSize) {
            const batch = posts.slice(i, i + batchSize);
            console.log(`📊 Gemini 배치 ${Math.floor(i / batchSize) + 1}/${Math.ceil(posts.length / batchSize)} 처리중...`);

            for (const post of batch) {
                try {
                    const analysis = await this.analyzeOnePost(post, template);

                    if (analysis.sentiment === "positive") sentimentCounts.positive++;
                    else if (analysis.sentiment === "negative") sentimentCounts.negative++;
                    else sentimentCounts.neutral++;

                    if (analysis.keyTopics) analysis.keyTopics.forEach((t: string) => keyTopics.add(t));
                    if (analysis.positiveAspects) positivePoints.push(...analysis.positiveAspects);
                    if (analysis.improvementAreas) improvementAreas.push(...analysis.improvementAreas);

                    post.sentiment = analysis.sentiment;
                    post.sentimentScore = analysis.confidence;
                    analyzedPosts.push({ ...post, gptAnalysis: analysis });
                } catch {
                    // 개별 실패 시 키워드 기반 fallback
                    const fallback = this.analyzeSinglePostKeywords(post);
                    sentimentCounts[fallback]++;
                    post.sentiment = fallback;
                    post.sentimentScore = 0.5;
                    analyzedPosts.push({ ...post });
                }
            }
        }

        const total = posts.length;
        const summary = await this.generateSummary(analyzedPosts, sentimentCounts, total, Array.from(keyTopics), positivePoints, improvementAreas, template);

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
            key_topics: Array.from(keyTopics).slice(0, 10),
            positive_points: positivePoints.slice(0, 10),
            improvement_areas: improvementAreas.slice(0, 10),
            summary,
            analysis_method: "gemini",
            processing_stats: { total_posts: total, processed_posts: total },
            analyzed_posts: analyzedPosts,
        };
    }

    private async analyzeOnePost(post: PostData, template: MonitoringTemplate) {
        const systemPrompt = `당신은 온라인 평판 분석 전문가입니다. 주어진 게시글을 분석하여 다음 JSON 형식으로 응답해주세요:
{
  "sentiment": "positive|neutral|negative",
  "confidence": 0.0-1.0,
  "keyTopics": ["주제1", "주제2"],
  "positiveAspects": ["긍정요소"],
  "improvementAreas": ["개선점"],
  "summary": "한줄 요약",
  "reasoning": "감정 분석 근거"
}
분석 시 전체 맥락과 의도로 감정을 판단하세요.`;

        const userPrompt = `제목: ${post.title}\n내용: ${post.content}\n분석 대상 키워드: ${template.keywords.join(", ")}`;

        const response = await this.gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
            config: {
                temperature: 0.3,
                maxOutputTokens: 800,
                responseMimeType: "application/json",
            },
        });

        return JSON.parse(response.text || "{}");
    }

    private async generateSummary(
        posts: any[], counts: { positive: number; neutral: number; negative: number },
        total: number, topics: string[], positives: string[], improvements: string[],
        template: MonitoringTemplate
    ): Promise<string> {
        try {
            const prompt = `다음 모니터링 분석 데이터를 바탕으로 한국어로 종합 요약을 150자 내외로 작성하세요.
대상: ${template.name}
총 게시글: ${total}개 (긍정 ${counts.positive}, 중립 ${counts.neutral}, 부정 ${counts.negative})
주요 토픽: ${topics.join(", ")}
긍정 요소: ${positives.slice(0, 5).join(", ")}
개선 필요: ${improvements.slice(0, 5).join(", ")}`;

            const response = await this.gemini.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { temperature: 0.7, maxOutputTokens: 300 },
            });

            return response.text?.trim() || this.fallbackSummary(counts, total, template);
        } catch {
            return this.fallbackSummary(counts, total, template);
        }
    }

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
            key_topics: template.keywords.slice(0, 5),
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

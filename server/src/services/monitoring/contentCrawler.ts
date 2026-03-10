import axios from "axios";
import * as cheerio from "cheerio";
import type { PostData } from "./types.js";

/**
 * 콘텐츠 크롤러 - 게시글 본문 수집
 * CMP ContentCrawler를 경량화 이식 (axios + cheerio, Puppeteer 없음)
 */
export class ContentCrawler {

    /**
     * 게시글 URL에서 본문 내용을 보강 크롤링
     * API 결과의 description은 일부만 포함하므로, 원본 페이지에서 전체 본문을 가져옴
     */
    async enrichPosts(posts: PostData[]): Promise<PostData[]> {
        const enriched: PostData[] = [];

        for (const post of posts) {
            try {
                const enrichedPost = await this.fetchContent(post);
                enriched.push(enrichedPost);
            } catch {
                // 크롤링 실패 시 원본 데이터 유지
                enriched.push(post);
            }
            // Rate limiting: 요청 간 200ms 대기
            await this.delay(200);
        }

        return enriched;
    }

    private async fetchContent(post: PostData): Promise<PostData> {
        if (!post.url) return post;

        try {
            // 네이버 블로그 모바일 URL로 변환 (크롤링 더 용이)
            let targetUrl = post.url;
            if (targetUrl.includes("blog.naver.com")) {
                targetUrl = targetUrl.replace("blog.naver.com", "m.blog.naver.com");
            }

            const response = await axios.get(targetUrl, {
                timeout: 8000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                },
                maxRedirects: 3,
            });

            const $ = cheerio.load(response.data);

            // 네이버 블로그 본문 추출
            let content = "";
            const selectors = [
                ".se-main-container",           // 스마트에디터 3
                "#postViewArea",                // 구 에디터
                ".post_ct",                     // 모바일 블로그
                ".se_component_wrap",           // 스마트에디터 2
                "article",                      // 일반적인 article 태그
                ".article_body",                // 뉴스 기사
                ".news_end",                    // 뉴스 본문
                "#articleBodyContents",          // 뉴스 본문 2
                ".content",                     // 일반 본문
                "main",                         // 시맨틱 태그
            ];

            for (const selector of selectors) {
                const el = $(selector);
                if (el.length > 0 && el.text().trim().length > 50) {
                    content = el.text().trim();
                    break;
                }
            }

            // 메타 description fallback
            if (!content || content.length < 30) {
                const metaDesc = $('meta[name="description"]').attr("content")
                    || $('meta[property="og:description"]').attr("content");
                if (metaDesc) content = metaDesc;
            }

            // 댓글 수집 시도
            let commentCount = 0;
            const commentEl = $(".u_cbox_count, .comment_count, .reply_count");
            if (commentEl.length > 0) {
                commentCount = parseInt(commentEl.first().text().replace(/[^0-9]/g, "")) || 0;
            }

            return {
                ...post,
                content: content.length > post.content.length ? this.cleanText(content).substring(0, 2000) : post.content,
                engagement: {
                    ...post.engagement,
                    likes: post.engagement?.likes || 0,
                    shares: post.engagement?.shares || 0,
                    views: post.engagement?.views || 0,
                    comments: commentCount || post.engagement?.comments || 0,
                },
            };
        } catch {
            return post;
        }
    }

    private cleanText(text: string): string {
        return text
            .replace(/\s+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

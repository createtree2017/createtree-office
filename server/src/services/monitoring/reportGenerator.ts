import { google } from "googleapis";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import type { PostData, AnalysisResult, MonitoringTemplate } from "./types.js";

/**
 * 모니터링 보고서 생성기
 * HTML 보고서 (드라이브 저장) + 엑셀 다운로드
 */
export class ReportGenerator {

    // HTML 보고서 생성 및 구글 드라이브 업로드
    async generateAndUpload(
        template: MonitoringTemplate,
        posts: PostData[],
        analysis: AnalysisResult,
        client: { name: string; driveFolderId: string | null }
    ): Promise<string | null> {
        if (!client.driveFolderId) return null;

        const html = this.generateHtml(template, posts, analysis, client.name);
        const fileName = `모니터링_보고서_${client.name}_${new Date().toISOString().split("T")[0]}.html`;

        // 보고서 폴더 찾거나 생성
        const folderId = await this.getOrCreateReportFolder(client.driveFolderId);

        // 업로드
        const auth = this.getAuth();
        const drive = google.drive({ version: "v3", auth });

        const bufferStream = new Readable();
        bufferStream.push(Buffer.from(html, "utf-8"));
        bufferStream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: "text/html",
                parents: [folderId],
            },
            media: { mimeType: "text/html", body: bufferStream },
            fields: "id",
            supportsAllDrives: true,
        });

        return response.data.id || null;
    }

    private async getOrCreateReportFolder(parentFolderId: string): Promise<string> {
        const auth = this.getAuth();
        const drive = google.drive({ version: "v3", auth });

        // 기존 폴더 검색
        const searchRes = await drive.files.list({
            q: `'${parentFolderId}' in parents and name='모니터링보고서' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        if (searchRes.data.files && searchRes.data.files.length > 0) {
            return searchRes.data.files[0].id!;
        }

        // 없으면 생성
        const createRes = await drive.files.create({
            requestBody: {
                name: "모니터링보고서",
                mimeType: "application/vnd.google-apps.folder",
                parents: [parentFolderId],
            },
            fields: "id",
            supportsAllDrives: true,
        });

        return createRes.data.id!;
    }

    // 엑셀 버퍼 생성
    generateExcel(template: MonitoringTemplate, posts: PostData[], analysis: AnalysisResult): Buffer {
        const wb = XLSX.utils.book_new();

        // 시트 1: 요약
        const summaryData = [
            ["모니터링 보고서"],
            ["대상", template.name],
            ["키워드", (template.keywords ?? []).join(", ")],
            ["분석일", new Date().toISOString().split("T")[0]],
            ["총 게시글", posts.length],
            [],
            ["감성 분석 결과"],
            ["긍정", analysis.sentiment_distribution.positive, `${analysis.sentiment_distribution.percentage.positive}%`],
            ["중립", analysis.sentiment_distribution.neutral, `${analysis.sentiment_distribution.percentage.neutral}%`],
            ["부정", analysis.sentiment_distribution.negative, `${analysis.sentiment_distribution.percentage.negative}%`],
            [],
            ["AI 분석 요약"],
            [analysis.summary],
        ];
        const wsSum = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSum, "요약");

        // 시트 2: 게시글 목록
        const postsData = [
            ["번호", "제목", "작성자", "날짜", "감성", "점수", "URL", "출처"],
            ...posts.map((p, i) => [
                i + 1,
                p.title,
                p.author,
                p.publishedAt,
                p.sentiment || "미분석",
                p.sentimentScore || 0,
                p.url,
                p.source || p.platform,
            ]),
        ];
        const wsPosts = XLSX.utils.aoa_to_sheet(postsData);
        XLSX.utils.book_append_sheet(wb, wsPosts, "게시글 목록");

        return Buffer.from(XLSX.write(wb, { bookType: "xlsx", type: "buffer" }));
    }

    // HTML 보고서 생성
    generateHtml(template: MonitoringTemplate, posts: PostData[], analysis: AnalysisResult, clientName: string): string {
        const date = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
        const posCount = analysis.sentiment_distribution.positive;
        const neuCount = analysis.sentiment_distribution.neutral;
        const negCount = analysis.sentiment_distribution.negative;
        const total = analysis.sentiment_distribution.total || posts.length;
        const posPct = analysis.sentiment_distribution.percentage.positive;
        const neuPct = analysis.sentiment_distribution.percentage.neutral;
        const negPct = analysis.sentiment_distribution.percentage.negative;

        return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${clientName} 모니터링 보고서 - ${date}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Pretendard','-apple-system','Noto Sans KR',sans-serif;background:#f5f7fa;color:#1a1a2e;line-height:1.6}
.container{max-width:960px;margin:0 auto;padding:24px}
.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:40px 32px;border-radius:16px;margin-bottom:24px}
.header h1{font-size:24px;font-weight:700;margin-bottom:8px}
.header .meta{font-size:14px;opacity:0.85}
.card{background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.card h2{font-size:18px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.stat-box{text-align:center;padding:20px;border-radius:10px}
.stat-box.positive{background:#ecfdf5;border:1px solid #a7f3d0}
.stat-box.neutral{background:#fefce8;border:1px solid #fde68a}
.stat-box.negative{background:#fef2f2;border:1px solid #fecaca}
.stat-box .number{font-size:32px;font-weight:700;display:block}
.stat-box.positive .number{color:#059669}
.stat-box.neutral .number{color:#ca8a04}
.stat-box.negative .number{color:#dc2626}
.stat-box .label{font-size:13px;color:#64748b;margin-top:4px}
.bar-chart{margin-top:12px}
.bar-row{display:flex;align-items:center;margin-bottom:8px}
.bar-label{width:50px;font-size:13px;font-weight:500}
.bar-bg{flex:1;height:24px;background:#f1f5f9;border-radius:12px;overflow:hidden}
.bar-fill{height:100%;border-radius:12px;transition:width .5s}
.bar-fill.pos{background:linear-gradient(90deg,#34d399,#059669)}
.bar-fill.neu{background:linear-gradient(90deg,#fbbf24,#ca8a04)}
.bar-fill.neg{background:linear-gradient(90deg,#f87171,#dc2626)}
.bar-value{width:50px;text-align:right;font-size:13px;font-weight:600}
.summary-text{background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #667eea;font-size:15px}
.posts-table{width:100%;border-collapse:collapse;font-size:13px}
.posts-table th{background:#f1f5f9;padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0}
.posts-table td{padding:10px 12px;border-bottom:1px solid #f1f5f9}
.posts-table tr:hover{background:#f8fafc}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.badge.positive{background:#dcfce7;color:#16a34a}
.badge.neutral{background:#fef9c3;color:#a16207}
.badge.negative{background:#fee2e2;color:#dc2626}
.keywords{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.keyword{background:#eef2ff;color:#4f46e5;padding:4px 12px;border-radius:20px;font-size:13px}
.footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;padding:16px}
a{color:#667eea;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>📊 ${clientName} 모니터링 보고서</h1>
        <div class="meta">${date} | 대상: ${template.name} | 수집: ${total}건 | 분석: ${analysis.analysis_method.toUpperCase()}</div>
    </div>

    <div class="card">
        <h2>📈 감성 분석 결과</h2>
        <div class="stats-grid">
            <div class="stat-box positive"><span class="number">${posPct}%</span><div class="label">긍정 (${posCount}건)</div></div>
            <div class="stat-box neutral"><span class="number">${neuPct}%</span><div class="label">중립 (${neuCount}건)</div></div>
            <div class="stat-box negative"><span class="number">${negPct}%</span><div class="label">부정 (${negCount}건)</div></div>
        </div>
        <div class="bar-chart" style="margin-top:20px">
            <div class="bar-row"><span class="bar-label">긍정</span><div class="bar-bg"><div class="bar-fill pos" style="width:${posPct}%"></div></div><span class="bar-value">${posPct}%</span></div>
            <div class="bar-row"><span class="bar-label">중립</span><div class="bar-bg"><div class="bar-fill neu" style="width:${neuPct}%"></div></div><span class="bar-value">${neuPct}%</span></div>
            <div class="bar-row"><span class="bar-label">부정</span><div class="bar-bg"><div class="bar-fill neg" style="width:${negPct}%"></div></div><span class="bar-value">${negPct}%</span></div>
        </div>
    </div>

    <div class="card">
        <h2>💡 AI 분석 요약</h2>
        <div class="summary-text">${analysis.summary || "분석 요약이 없습니다."}</div>
        <div style="margin-top:16px">
            <strong>모니터링 키워드:</strong>
            <div class="keywords">${(template.keywords ?? []).map((k) => `<span class="keyword">${k}</span>`).join("")}</div>
        </div>
        ${analysis.key_topics.length > 0 ? `<div style="margin-top:12px"><strong>주요 토픽:</strong><div class="keywords">${analysis.key_topics.map((t) => `<span class="keyword">${t}</span>`).join("")}</div></div>` : ""}
    </div>

    <div class="card">
        <h2>📋 수집 게시글 (${posts.length}건)</h2>
        <table class="posts-table">
            <thead><tr><th>#</th><th>제목</th><th>감성</th><th>출처</th><th>날짜</th></tr></thead>
            <tbody>
${posts.slice(0, 50).map((p, i) => `                <tr>
                    <td>${i + 1}</td>
                    <td><a href="${p.url}" target="_blank">${this.escapeHtml(p.title.substring(0, 60))}${p.title.length > 60 ? "..." : ""}</a></td>
                    <td><span class="badge ${p.sentiment || "neutral"}">${this.sentimentLabel(p.sentiment)}</span></td>
                    <td>${p.source || p.platform}</td>
                    <td>${p.publishedAt}</td>
                </tr>`).join("\n")}
            </tbody>
        </table>
        ${posts.length > 50 ? `<p style="margin-top:12px;color:#94a3b8;font-size:13px">외 ${posts.length - 50}건 더 있음</p>` : ""}
    </div>

    <div class="footer">createTree Office 모니터링 시스템 | 자동 생성 보고서</div>
</div>
</body>
</html>`;
    }

    private sentimentLabel(s?: string): string {
        return { positive: "긍정", neutral: "중립", negative: "부정" }[s || "neutral"] || "중립";
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    private getAuth() {
        const authOptions: any = {
            scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
        };
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        }
        return new google.auth.GoogleAuth(authOptions);
    }
}

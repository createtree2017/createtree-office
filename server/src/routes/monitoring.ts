import { Router } from "express";
import { authenticateToken, authorizeRole, AuthRequest } from "../middleware/auth.js";
import { MonitoringService } from "../services/monitoring/monitoringService.js";
import { ReportGenerator } from "../services/monitoring/reportGenerator.js";

const router = Router();
const monitoringService = new MonitoringService();
const reportGenerator = new ReportGenerator();

// ===== 템플릿 CRUD =====

// 템플릿 목록 조회 (거래처별 분리)
router.get("/templates", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const user = req.user!;
        const clientId = ["ADMIN", "MANAGER"].includes(user.role) ? null : user.clientId;
        const templates = await monitoringService.getTemplates(clientId);
        res.json({ success: true, data: templates });
    } catch (error: any) {
        console.error("템플릿 목록 조회 오류:", error);
        res.status(500).json({ success: false, message: "템플릿 목록을 불러올 수 없습니다." });
    }
});

// 단일 템플릿 조회
router.get("/templates/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const template = await monitoringService.getTemplate(parseInt(req.params.id));
        if (!template) return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });
        res.json({ success: true, data: template });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "템플릿 조회 실패" });
    }
});

// 템플릿 생성
router.post("/templates", authenticateToken, authorizeRole(["ADMIN", "MANAGER", "HOSPITAL_ADMIN"]), async (req: AuthRequest, res) => {
    try {
        const user = req.user!;
        const { name, clientId, keywords, monitoringScope, searchType, dateRange, collectCount, crawlingMethod, analysisMode, targetPlaces, targetCafes } = req.body;

        if (!name || !clientId || !keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({ success: false, message: "필수 항목을 입력해주세요. (이름, 거래처, 키워드)" });
        }

        const created = await monitoringService.createTemplate({
            name,
            clientId: parseInt(clientId),
            keywords,
            monitoringScope: monitoringScope || ["blog", "cafe"],
            searchType: searchType || "latest",
            dateRange: dateRange || 7,
            collectCount: collectCount || 10,
            crawlingMethod: crawlingMethod || "api",
            analysisMode: analysisMode || "FULL",
            targetPlaces: targetPlaces || null,
            targetCafes: targetCafes || null,
            createdBy: user.id,
        });

        res.json({ success: true, data: created });
    } catch (error: any) {
        console.error("템플릿 생성 오류:", error);
        res.status(500).json({ success: false, message: "템플릿 생성에 실패했습니다." });
    }
});

// 템플릿 수정
router.put("/templates/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER", "HOSPITAL_ADMIN"]), async (req: AuthRequest, res) => {
    try {
        const updated = await monitoringService.updateTemplate(parseInt(req.params.id), req.body);
        if (!updated) return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });
        res.json({ success: true, data: updated });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "템플릿 수정 실패" });
    }
});

// 템플릿 삭제
router.delete("/templates/:id", authenticateToken, authorizeRole(["ADMIN", "MANAGER"]), async (req: AuthRequest, res) => {
    try {
        await monitoringService.deleteTemplate(parseInt(req.params.id));
        res.json({ success: true, message: "삭제되었습니다." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "템플릿 삭제 실패" });
    }
});

// ===== 모니터링 실행 =====

router.post("/templates/:id/execute", authenticateToken, authorizeRole(["ADMIN", "MANAGER", "HOSPITAL_ADMIN"]), async (req: AuthRequest, res) => {
    try {
        const user = req.user!;
        const resultId = await monitoringService.executeMonitoring(parseInt(req.params.id), user.id);
        res.json({ success: true, data: { resultId }, message: "모니터링이 시작되었습니다." });
    } catch (error: any) {
        console.error("모니터링 실행 오류:", error);
        res.status(500).json({ success: false, message: error.message || "모니터링 실행에 실패했습니다." });
    }
});

// ===== 결과 조회 =====

// 결과 목록
router.get("/results", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const user = req.user!;
        const clientId = ["ADMIN", "MANAGER"].includes(user.role) ? null : user.clientId;
        const templateId = req.query.templateId ? parseInt(req.query.templateId as string) : undefined;
        const results = await monitoringService.getResults(clientId, templateId);
        res.json({ success: true, data: results });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "결과 목록 조회 실패" });
    }
});

// 단일 결과 상세
router.get("/results/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const result = await monitoringService.getResult(parseInt(req.params.id));
        if (!result) return res.status(404).json({ success: false, message: "결과를 찾을 수 없습니다." });
        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "결과 조회 실패" });
    }
});

// 엑셀 다운로드
router.get("/results/:id/excel", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const result = await monitoringService.getResult(parseInt(req.params.id));
        if (!result) return res.status(404).json({ success: false, message: "결과를 찾을 수 없습니다." });

        // 템플릿 정보 조회
        const template = await monitoringService.getTemplate(result.templateId);
        if (!template) return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });

        const excelBuffer = reportGenerator.generateExcel(
            template as any,
            (result.posts as any[]) || [],
            (result.statistics as any) || { sentiment_distribution: { positive: 0, neutral: 0, negative: 0, total: 0, percentage: { positive: 0, neutral: 0, negative: 0 } }, summary: "", key_topics: [], positive_points: [], improvement_areas: [], overall_sentiment: "neutral", analysis_method: "fallback", processing_stats: { total_posts: 0, processed_posts: 0 } }
        );

        const fileName = encodeURIComponent(`모니터링_보고서_${template.name}_${new Date().toISOString().split("T")[0]}.xlsx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.send(excelBuffer);
    } catch (error: any) {
        console.error("엑셀 다운로드 오류:", error);
        res.status(500).json({ success: false, message: "엑셀 다운로드 실패" });
    }
});

// HTML 보고서 보기
router.get("/results/:id/report", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const result = await monitoringService.getResult(parseInt(req.params.id));
        if (!result) return res.status(404).json({ success: false, message: "결과를 찾을 수 없습니다." });

        const template = await monitoringService.getTemplate(result.templateId);
        if (!template) return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });

        const html = reportGenerator.generateHtml(
            template as any,
            (result.posts as any[]) || [],
            (result.statistics as any) || { sentiment_distribution: { positive: 0, neutral: 0, negative: 0, total: 0, percentage: { positive: 0, neutral: 0, negative: 0 } }, summary: "", key_topics: [], positive_points: [], improvement_areas: [], overall_sentiment: "neutral", analysis_method: "fallback", processing_stats: { total_posts: 0, processed_posts: 0 } },
            template.name
        );

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    } catch (error: any) {
        res.status(500).json({ success: false, message: "보고서 생성 실패" });
    }
});

export default router;

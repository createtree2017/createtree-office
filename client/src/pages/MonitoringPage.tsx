import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Plus,
  Play,
  Trash2,
  FileDown,
  FileText,
  RefreshCw,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Eye,
  Clock,
  AlertCircle,
  Pencil,
  Square,
} from "lucide-react";
import toast from "react-hot-toast";

const API = "/api/monitoring";
const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const getAuthOnly = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export interface MonitoringTemplate {
  id: number;
  name: string;
  templateType?: string;
  clientId: number;
  keywords: string[] | null;
  monitoringScope: string[];
  isActive: boolean;
  collectCount: number;
  searchType: string;
  dateRange: number;
  crawlingMethod: string;
  analysisMode: string;
  scheduleEnabled?: boolean;
  scheduleCron?: string | null;
  scheduleLastRunAt?: string | null;
  createdAt: string;
  targetPlaces?: Array<{ platform: string; url: string; name?: string; sortOrder?: string }>;
  targetCafes?: Array<{ url: string; name?: string }>;
}
export interface MonitoringResult {
  id: number;
  templateId: number;
  clientId: number;
  status: string;
  summary: string | null;
  executionTimeMs: number | null;
  driveFileId: string | null;
  createdAt: string;
  posts: any[] | null;
  statistics: any | null;
}
export interface MonitoringClient {
  id: number;
  name: string;
}

// 내부 사용 alias
type Template = MonitoringTemplate;
type Result = MonitoringResult;
type Client = MonitoringClient;

const MonitoringPage = () => {
  const [tab, setTab] = useState<"dashboard" | "templates" | "results">(
    "dashboard",
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [executing, setExecuting] = useState<Set<number>>(new Set());
  const [selectedResultIds, setSelectedResultIds] = useState<Set<number>>(
    new Set(),
  );
  const [clientFilter, setClientFilter] = useState<number | null>(null);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const canDelete = user.role === 'ADMIN' || user.role === 'MANAGER';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, rRes, cRes] = await Promise.all([
        fetch(`${API}/templates`, { headers: getHeaders() }),
        fetch(`${API}/results`, { headers: getHeaders() }),
        fetch("/api/clients", { headers: getHeaders() }),
      ]);
      const tData = await tRes.json();
      const rData = await rRes.json();
      const cData = await cRes.json();
      if (tData.success) setTemplates(tData.data);
      if (rData.success) setResults(rData.data);
      if (cData.success) setClients(cData.data);
    } catch {
      toast.error("데이터 로드 실패");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 실행 중인 결과 자동 새로고침
  useEffect(() => {
    const hasRunning = results.some(
      (r) => r.status === "RUNNING" || r.status === "PENDING",
    );
    if (!hasRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/results`, { headers: getHeaders() });
        const data = await res.json();
        if (data.success) setResults(data.data);
      } catch { }
    }, 5000);
    return () => clearInterval(interval);
  }, [results]);

  // 결과 목록 탭에서 30초마다 자동 새로고침 (스케줄 실행 결과 반영)
  useEffect(() => {
    if (tab !== "results") return;
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, fetchData]);

  const executeMonitoring = async (templateId: number) => {
    setExecuting((prev) => new Set(prev).add(templateId));
    try {
      const res = await fetch(`${API}/templates/${templateId}/execute`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("모니터링이 시작되었습니다!");
        fetchData();
      } else toast.error(data.message || "실행 실패");
    } catch {
      toast.error("실행 실패");
    }
    setExecuting((prev) => {
      const s = new Set(prev);
      s.delete(templateId);
      return s;
    });
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("이 템플릿과 관련 결과를 모두 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${API}/templates/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if ((await res.json()).success) {
        toast.success("삭제 완료");
        fetchData();
      }
    } catch {
      toast.error("삭제 실패");
    }
  };

  // 자동 실행 토글 (중단/시작)
  const toggleSchedule = async (template: Template) => {
    const newEnabled = !template.scheduleEnabled;
    try {
      const res = await fetch(`${API}/templates/${template.id}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({
          scheduleEnabled: newEnabled,
          scheduleCron: newEnabled ? (template.scheduleCron || "0 9 * * *") : template.scheduleCron,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newEnabled ? "자동 실행 시작" : "자동 실행 중단");
        fetchData();
      } else toast.error(data.message || "변경 실패");
    } catch {
      toast.error("변경 실패");
    }
  };

  const downloadExcel = async (resultId: number) => {
    try {
      const res = await fetch(`${API}/results/${resultId}/excel`, {
        headers: getAuthOnly(),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `monitoring_report_${resultId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("다운로드 실패");
    }
  };

  // ★ 수정: fetch로 HTML 가져와서 새 탭에 Blob URL로 표시 (인증 토큰 포함)
  const viewReport = async (resultId: number) => {
    try {
      const res = await fetch(`${API}/results/${resultId}/report`, {
        headers: getAuthOnly(),
      });
      if (!res.ok) {
        toast.error("보고서 로드 실패");
        return;
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html; charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      toast.error("보고서 보기 실패");
    }
  };

  // ★ 수정: 앱 내부 모달로 HTML 보고서 표시
  const deleteResults = async () => {
    if (selectedResultIds.size === 0)
      return toast.error("삭제할 항목을 선택해주세요.");
    if (!confirm(`선택한 ${selectedResultIds.size}건을 삭제하시겠습니까?`))
      return;
    try {
      const res = await fetch(`${API}/results`, {
        method: "DELETE",
        headers: getHeaders(),
        body: JSON.stringify({ ids: Array.from(selectedResultIds) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setSelectedResultIds(new Set());
        fetchData();
      } else toast.error(data.message);
    } catch {
      toast.error("삭제 실패");
    }
  };

  const toggleResultSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedResultIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedResultIds.size === results.length)
      setSelectedResultIds(new Set());
    else setSelectedResultIds(new Set(results.map((r) => r.id)));
  };

  const viewReportInModal = async (resultId: number) => {
    try {
      const res = await fetch(`${API}/results/${resultId}/report`, {
        headers: getAuthOnly(),
      });
      if (!res.ok) {
        toast.error("보고서 로드 실패");
        return;
      }
      const html = await res.text();
      setReportHtml(html);
    } catch {
      toast.error("보고서 보기 실패");
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      RUNNING: {
        label: "실행중",
        cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      },
      COMPLETED: {
        label: "완료",
        cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      },
      FAILED: {
        label: "실패",
        cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      },
      PENDING: {
        label: "대기",
        cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      },
      CANCELLED: {
        label: "취소",
        cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
      },
    };
    const s = map[status] || {
      label: status,
      cls: "bg-gray-100 text-gray-700",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}
      >
        {s.label}
      </span>
    );
  };

  const getSentimentIcon = (sentiment?: string) => {
    if (sentiment === "positive")
      return <TrendingUp size={16} className="text-green-500" />;
    if (sentiment === "negative")
      return <TrendingDown size={16} className="text-red-500" />;
    return <Minus size={16} className="text-yellow-500" />;
  };

  const completedResults = results.filter((r) => r.status === "COMPLETED");
  const totalPosts = completedResults.reduce(
    (sum, r) => sum + (r.posts?.length || 0),
    0,
  );
  const latestResult = completedResults[0];

  return (
    <div className="pt-14 min-h-screen bg-[hsl(var(--background))]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Activity size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">
                모니터링
              </h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                온라인 평판 모니터링 및 AI 감성 분석
              </p>
            </div>
          </div>

        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-6 bg-[hsl(var(--card))] p-1 rounded-xl border border-[hsl(var(--border))] w-fit">
          {[
            { key: "dashboard", label: "대시보드", icon: BarChart3 },
            { key: "templates", label: "템플릿", icon: Activity },
            { key: "results", label: "결과 목록", icon: FileText },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? "bg-violet-600 text-white shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"}`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* ========== 대시보드 탭 ========== */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "총 템플릿", value: templates.length },
                { label: "총 분석 횟수", value: completedResults.length },
                { label: "수집된 게시글", value: totalPosts },
                {
                  label: "최근 감성",
                  value:
                    latestResult?.statistics?.overall_sentiment === "positive"
                      ? "긍정적 😊"
                      : latestResult?.statistics?.overall_sentiment ===
                        "negative"
                        ? "부정적 😟"
                        : "중립 😐",
                },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5"
                >
                  <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {latestResult?.statistics && (
              <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-6">
                <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
                  <BarChart3 size={18} /> 최근 분석 결과
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    {
                      label: "긍정",
                      pct:
                        latestResult.statistics.sentiment_distribution
                          ?.percentage?.positive || 0,
                      cls: "text-green-600 dark:text-green-400",
                      bg: "bg-green-500",
                    },
                    {
                      label: "중립",
                      pct:
                        latestResult.statistics.sentiment_distribution
                          ?.percentage?.neutral || 0,
                      cls: "text-yellow-600 dark:text-yellow-400",
                      bg: "bg-yellow-500",
                    },
                    {
                      label: "부정",
                      pct:
                        latestResult.statistics.sentiment_distribution
                          ?.percentage?.negative || 0,
                      cls: "text-red-600 dark:text-red-400",
                      bg: "bg-red-500",
                    },
                  ].map((s, i) => (
                    <div key={i} className="text-center">
                      <p className={`text-2xl font-bold ${s.cls}`}>{s.pct}%</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {s.label}
                      </p>
                      <div className="mt-2 h-2 bg-[hsl(var(--accent))] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${s.bg} rounded-full transition-all`}
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {latestResult.summary && (
                  <div className="bg-[hsl(var(--accent))] rounded-lg p-4 text-sm text-[hsl(var(--foreground))]">
                    <p className="font-medium mb-1">💡 AI 분석 요약</p>
                    <p>{latestResult.summary}</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-6">
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock size={18} /> 최근 활동
                </span>
                <button
                  onClick={fetchData}
                  className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={12} /> 새로고침
                </button>
              </h3>
              <div className="space-y-2">
                {results.slice(0, 10).map((r) => {
                  const tpl = templates.find((t) => t.id === r.templateId);
                  return (
                    <div
                      key={r.id}
                      onClick={() =>
                        r.status === "COMPLETED" && setSelectedResult(r)
                      }
                      className={`flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--border))] ${r.status === "COMPLETED" ? "cursor-pointer hover:bg-[hsl(var(--accent))]" : ""} transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        {getSentimentIcon(r.statistics?.overall_sentiment)}
                        <div>
                          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {tpl?.name || `템플릿 #${r.templateId}`}
                          </p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {new Date(r.createdAt).toLocaleString("ko-KR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(r.status)}
                        {r.status === "RUNNING" && (
                          <RefreshCw
                            size={14}
                            className="text-blue-500 animate-spin"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                {results.length === 0 && (
                  <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">
                    아직 모니터링 결과가 없습니다. 템플릿을 만들고 실행해보세요!
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========== 템플릿 탭 ========== */}
        {tab === "templates" && (() => {
          // 템플릿에서 고유 거래처 목록 추출
          const uniqueClients = Array.from(
            new Map(templates.map(t => [t.clientId, (t as any).clientName || clients.find(c => c.id === t.clientId)?.name || `거래처 #${t.clientId}`])).entries()
          ).map(([id, name]) => ({ id, name }));
          const filteredTemplates = clientFilter === null ? templates : templates.filter(t => t.clientId === clientFilter);

          return (
          <div className="space-y-3">
            {/* 거래처 필터 바 */}
            {uniqueClients.length > 1 && (
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setClientFilter(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    clientFilter === null
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] hover:border-violet-300'
                  }`}
                >
                  전체
                </button>
                {uniqueClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setClientFilter(c.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      clientFilter === c.id
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                        : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] hover:border-violet-300'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {filteredTemplates.length === 0 && (
              <div className="text-center py-16 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
                <Activity
                  size={40}
                  className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]"
                />
                <p className="text-[hsl(var(--muted-foreground))]">
                  {clientFilter !== null ? '해당 거래처의 템플릿이 없습니다.' : '모니터링 템플릿이 없습니다.'}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                  관리자에게 템플릿 생성을 요청하세요. (템플릿 관리 메뉴)
                </p>
              </div>
            )}
            {filteredTemplates.map((t) => (
              <div
                key={t.id}
                className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${t.templateType === "place" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}
                    >
                      {t.templateType === "place"
                        ? "🏥 플레이스"
                        : "🔍 통합검색"}
                    </span>
                    <h3 className="font-semibold text-[hsl(var(--foreground))]">
                      {t.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500"}`}
                    >
                      {t.isActive ? "활성" : "비활성"}
                    </span>
                    {t.scheduleEnabled && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        자동 실행중
                      </span>
                    )}
                  </div>
                  {t.keywords && t.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {t.keywords.map((k: string, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded-full text-xs font-medium"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.templateType === "place" &&
                    t.targetPlaces &&
                    t.targetPlaces.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {t.targetPlaces.map((p: any, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full text-xs font-medium"
                          >
                            {p.name || p.platform}
                          </span>
                        ))}
                      </div>
                    )}
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    범위: {t.monitoringScope?.join(", ")} | 거래처: {(t as any).clientName ?? '알 수 없음'} | 수집: {t.collectCount}건
                    {t.scheduleEnabled &&
                      t.scheduleCron &&
                      ` | 자동: ${t.scheduleCron}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {t.scheduleEnabled ? (
                    canDelete ? (
                      <button
                        onClick={() => toggleSchedule(t)}
                        className="flex items-center justify-center gap-1.5 min-w-[110px] px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors group"
                        title="클릭하여 자동 실행 중단"
                      >
                        <RefreshCw size={14} className="animate-spin group-hover:hidden" />
                        <Square size={14} className="hidden group-hover:block" />
                        <span className="group-hover:hidden">자동 실행중</span>
                        <span className="hidden group-hover:block">중단</span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 min-w-[110px] px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold cursor-default">
                        <RefreshCw size={14} className="animate-spin" />
                        자동 실행중
                      </span>
                    )
                  ) : (
                    <button
                      onClick={() => executeMonitoring(t.id)}
                      disabled={executing.has(t.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {executing.has(t.id) ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                      {executing.has(t.id) ? "실행중..." : "실행"}
                    </button>
                  )}

                </div>
              </div>
            ))}
          </div>
          );
        })()}

        {/* ========== 결과 목록 탭 ========== */}
        {tab === "results" && (
          <div className="space-y-3">
            {results.length > 0 && canDelete && (
              <div className="flex items-center justify-between bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] px-5 py-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[hsl(var(--muted-foreground))]">
                  <input
                    type="checkbox"
                    checked={
                      selectedResultIds.size === results.length &&
                      results.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-violet-600"
                  />
                  전체 선택 ({selectedResultIds.size}/{results.length})
                </label>
                {selectedResultIds.size > 0 && (
                  <button
                    onClick={deleteResults}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors"
                  >
                    <Trash2 size={14} /> {selectedResultIds.size}건 삭제
                  </button>
                )}
              </div>
            )}
            {results.length === 0 && (
              <div className="text-center py-16 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
                <FileText
                  size={40}
                  className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]"
                />
                <p className="text-[hsl(var(--muted-foreground))]">
                  모니터링 결과가 없습니다.
                </p>
              </div>
            )}
            {results.map((r) => {
              const tpl = templates.find((t) => t.id === r.templateId);
              return (
                <div
                  key={r.id}
                  onClick={() =>
                    r.status === "COMPLETED" && setSelectedResult(r)
                  }
                  className={`bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 flex items-center justify-between ${r.status === "COMPLETED" ? "cursor-pointer hover:border-violet-300 dark:hover:border-violet-700" : ""} ${selectedResultIds.has(r.id) ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/10" : ""} transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    {canDelete && (
                      <input
                        type="checkbox"
                        checked={selectedResultIds.has(r.id)}
                        onClick={(e) => toggleResultSelect(r.id, e)}
                        onChange={() => { }}
                        className="w-4 h-4 rounded accent-violet-600 shrink-0"
                      />
                    )}
                    {getSentimentIcon(r.statistics?.overall_sentiment)}
                    <div>
                      <p className="font-semibold text-sm text-[hsl(var(--foreground))]">
                        {tpl?.name || `#${r.templateId}`}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(r.createdAt).toLocaleString("ko-KR")}{" "}
                        {r.executionTimeMs
                          ? `• ${(r.executionTimeMs / 1000).toFixed(1)}초`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status === "COMPLETED" && r.posts && (
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {r.posts.length}건
                      </span>
                    )}
                    {getStatusBadge(r.status)}
                    {r.status === "COMPLETED" && (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadExcel(r.id);
                          }}
                          className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                          title="엑셀 다운로드"
                        >
                          <FileDown size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            viewReportInModal(r.id);
                          }}
                          className="p-1.5 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg"
                          title="HTML 보고서 보기"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    )}
                    {r.status === "RUNNING" && (
                      <RefreshCw
                        size={14}
                        className="text-blue-500 animate-spin"
                      />
                    )}
                    {r.status === "FAILED" && (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========== 결과 상세 모달 ========== */}
      {selectedResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="bg-[hsl(var(--card))] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
                  분석 결과 상세
                </h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {new Date(selectedResult.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadExcel(selectedResult.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                >
                  <FileDown size={14} /> 엑셀
                </button>
                <button
                  onClick={() => viewReport(selectedResult.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700"
                >
                  <Eye size={14} /> 보고서
                </button>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {selectedResult.statistics && (
                <div>
                  <h3 className="font-semibold mb-3 text-[hsl(var(--foreground))]">
                    📊 감성 분석
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        label: "긍정",
                        pct:
                          selectedResult.statistics.sentiment_distribution
                            ?.percentage?.positive || 0,
                        count:
                          selectedResult.statistics.sentiment_distribution
                            ?.positive || 0,
                        cls: "text-green-600",
                        bg: "bg-green-100 dark:bg-green-900/30",
                      },
                      {
                        label: "중립",
                        pct:
                          selectedResult.statistics.sentiment_distribution
                            ?.percentage?.neutral || 0,
                        count:
                          selectedResult.statistics.sentiment_distribution
                            ?.neutral || 0,
                        cls: "text-yellow-600",
                        bg: "bg-yellow-100 dark:bg-yellow-900/30",
                      },
                      {
                        label: "부정",
                        pct:
                          selectedResult.statistics.sentiment_distribution
                            ?.percentage?.negative || 0,
                        count:
                          selectedResult.statistics.sentiment_distribution
                            ?.negative || 0,
                        cls: "text-red-600",
                        bg: "bg-red-100 dark:bg-red-900/30",
                      },
                    ].map((s, i) => (
                      <div
                        key={i}
                        className={`${s.bg} rounded-xl p-4 text-center`}
                      >
                        <p className={`text-3xl font-bold ${s.cls}`}>
                          {s.pct}%
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          {s.label} ({s.count}건)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedResult.summary && (
                <div>
                  <h3 className="font-semibold mb-2 text-[hsl(var(--foreground))]">
                    💡 AI 분석 요약
                  </h3>
                  <div className="bg-[hsl(var(--accent))] rounded-lg p-4 text-sm text-[hsl(var(--foreground))] leading-relaxed">
                    {selectedResult.summary}
                  </div>
                </div>
              )}
              {selectedResult.posts && selectedResult.posts.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-[hsl(var(--foreground))]">
                    📋 수집 게시글 ({selectedResult.posts.length}건)
                  </h3>
                  <div className="space-y-2">
                    {selectedResult.posts
                      .slice(0, 30)
                      .map((p: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--border))] text-sm"
                        >
                          <span className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 w-6">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-[hsl(var(--foreground))] hover:text-violet-600 truncate block"
                            >
                              {p.title}
                            </a>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                              {p.content?.substring(0, 80)}...
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${p.sentiment === "positive" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : p.sentiment === "negative" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}
                          >
                            {p.sentiment === "positive"
                              ? "긍정"
                              : p.sentiment === "negative"
                                ? "부정"
                                : "중립"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== HTML 보고서 모달 ========== */}
      {reportHtml && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-[3vh]"
          onClick={() => setReportHtml(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <h2 className="font-bold text-gray-900">📊 HTML 보고서</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([reportHtml], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  }}
                  className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700"
                >
                  새 탭에서 보기
                </button>
                <button
                  onClick={() => setReportHtml(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <iframe
              srcDoc={reportHtml}
              className="flex-1 w-full border-0 rounded-b-2xl"
              title="모니터링 보고서"
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"
            />
          </div>
        </div>
      )}


    </div>
  );
};

// ===== 통합 템플릿 폼 모달 (생성/수정 겸용) =====
export const TemplateFormModal = ({
  mode,
  template,
  clients,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  template?: Template;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [templateType, setTemplateType] = useState<"integrated" | "place">(
    (template?.templateType as any) || "integrated",
  );
  const [step, setStep] = useState<"selectType" | "form">(
    mode === "edit" ? "form" : "selectType",
  );
  const [name, setName] = useState(template?.name || "");
  const [clientId, setClientId] = useState(
    template?.clientId?.toString() || "",
  );
  const [collectCount, setCollectCount] = useState(
    template?.collectCount || 10,
  );
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [keywordsStr, setKeywordsStr] = useState(
    template?.keywords?.join(", ") || "",
  );
  const [scope, setScope] = useState<string[]>(
    template?.monitoringScope || ["blog", "cafe"],
  );
  const [crawlingMethod, setCrawlingMethod] = useState(
    template?.crawlingMethod || "api",
  );
  const [searchType, setSearchType] = useState<"latest" | "accuracy">(
    (template?.searchType as any) || "latest",
  );
  const [targetCafes, setTargetCafes] = useState<
    Array<{ url: string; name?: string }>
  >(template?.targetCafes || []);
  const [targetPlaces, setTargetPlaces] = useState<
    Array<{ platform: string; url: string; name?: string; sortOrder?: string }>
  >(template?.targetPlaces || []);
  const [scheduleEnabled, setScheduleEnabled] = useState(
    template?.scheduleEnabled || false,
  );
  const [notifyEnabled, setNotifyEnabled] = useState(
    (template as any)?.notifyEnabled || false,
  );
  const [scheduleHour, setScheduleHour] = useState(() => {
    if (template?.scheduleCron) {
      const parts = template.scheduleCron.split(" ");
      // "*/2 * * * *" → 2분마다(테스트) = -1
      if (parts[0].startsWith("*/")) return -1;
      // "0 9 * * *" → 시간 추출
      return parseInt(parts[1]) || 9;
    }
    return 9;
  });

  const isEdit = mode === "edit";
  const hasCafeSpecific = scope.includes("cafe_specific");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !clientId) {
      toast.error("이름과 거래처를 입력해주세요.");
      return;
    }
    if (templateType === "integrated" && !keywordsStr.trim()) {
      toast.error("키워드를 입력해주세요.");
      return;
    }
    if (
      templateType === "place" &&
      targetPlaces.filter((p) => p.url.trim()).length === 0
    ) {
      toast.error("최소 1개의 플레이스 URL을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        name,
        templateType,
        clientId: parseInt(clientId),
        collectCount: Math.min(
          collectCount,
          templateType === "place" ? 100 : 50,
        ),
        isActive,
        scheduleEnabled,
        scheduleCron: scheduleEnabled
          ? scheduleHour === -1
            ? "*/2 * * * *"
            : `0 ${scheduleHour} * * *`
          : null,
        searchType,
        notifyEnabled,
      };
      if (templateType === "integrated") {
        body.keywords = keywordsStr
          .split(",")
          .map((k: string) => k.trim())
          .filter(Boolean);
        body.monitoringScope = scope;
        body.crawlingMethod = hasCafeSpecific ? "hybrid" : crawlingMethod;
        body.targetCafes = hasCafeSpecific
          ? targetCafes.filter((c) => c.url.trim())
          : null;
        body.targetPlaces = null;
      } else {
        body.keywords = null;
        body.monitoringScope = [
          ...new Set(
            targetPlaces.map((p) =>
              p.platform === "kakaomap" ? "kakaomap" : p.platform === "googleplace" ? "googleplace" : "naverplace",
            ),
          ),
        ];
        body.crawlingMethod = "hybrid";
        body.targetPlaces = targetPlaces.filter((p) => p.url.trim());
        body.targetCafes = null;
      }
      const url = isEdit
        ? `${API}/templates/${template!.id}`
        : `${API}/templates`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(isEdit ? "템플릿 수정 완료!" : "템플릿 생성 완료!");
        onSaved();
      } else toast.error(data.message || "저장 실패");
    } catch {
      toast.error("저장 실패");
    }
    setSaving(false);
  };

  const toggleScope = (s: string) =>
    setScope((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  const addPlace = (platform: string) =>
    setTargetPlaces((prev) => [...prev, { platform, url: "", name: "", sortOrder: "latest" }]);
  const removePlace = (idx: number) =>
    setTargetPlaces((prev) => prev.filter((_, i) => i !== idx));
  const updatePlace = (idx: number, field: string, value: string) =>
    setTargetPlaces((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  const addCafe = () =>
    setTargetCafes((prev) => [...prev, { url: "", name: "" }]);
  const removeCafe = (idx: number) =>
    setTargetCafes((prev) => prev.filter((_, i) => i !== idx));
  const updateCafe = (idx: number, field: string, value: string) =>
    setTargetCafes((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    );

  const inputCls =
    "w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-violet-500";

  if (step === "selectType") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        <div
          className="bg-[hsl(var(--card))] rounded-2xl shadow-2xl w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              모니터링 타입 선택
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <X size={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setTemplateType("integrated");
                setStep("form");
              }}
              className="p-6 rounded-xl border-2 border-[hsl(var(--border))] hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-center"
            >
              <div className="text-3xl mb-3">{"🔍"}</div>
              <h3 className="font-bold text-[hsl(var(--foreground))] mb-1">
                통합검색
              </h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {"블로그, 카페, 뉴스"}
                <br />
                {"키워드 기반 API 검색"}
              </p>
            </button>
            <button
              onClick={() => {
                setTemplateType("place");
                setStep("form");
              }}
              className="p-6 rounded-xl border-2 border-[hsl(var(--border))] hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all text-center"
            >
              <div className="text-3xl mb-3">{"🏥"}</div>
              <h3 className="font-bold text-[hsl(var(--foreground))] mb-1">
                플레이스
              </h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {"네이버/카카오/구글"}
                <br />
                {"플레이스 리뷰 크롤링"}
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-[hsl(var(--card))] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-[hsl(var(--card))] px-6 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            {!isEdit && (
              <button
                type="button"
                onClick={() => setStep("selectType")}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                {"←"}
              </button>
            )}
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${templateType === "place" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}
            >
              {templateType === "place" ? "🏥 플레이스" : "🔍 통합검색"}
            </span>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {isEdit ? "템플릿 수정" : "새 템플릿"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
              템플릿 이름 *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder={
                templateType === "place"
                  ? "예: A병원 네이버 플레이스 리뷰"
                  : "예: A병원 온라인 평판"
              }
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
              거래처 *
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={inputCls}
            >
              <option value="">선택하세요</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {templateType === "integrated" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
                  키워드 * (쉼표로 구분)
                </label>
                <input
                  value={keywordsStr}
                  onChange={(e) => setKeywordsStr(e.target.value)}
                  className={inputCls}
                  placeholder="예: A병원 후기, A병원 리뷰"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-2">
                  모니터링 범위
                </label>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    {"🔍 네이버 검색 (API)"}
                  </p>
                  <div className="flex gap-2">
                    {["blog", "news"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleScope(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${scope.includes(s) ? "bg-violet-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"}`}
                      >
                        {s === "blog" ? "블로그" : "뉴스"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mt-2">
                    {"☕ 카페"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        toggleScope("cafe");
                        if (scope.includes("cafe_specific"))
                          setScope((prev) =>
                            prev.filter((x) => x !== "cafe_specific"),
                          );
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${scope.includes("cafe") ? "bg-violet-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"}`}
                    >
                      전체 검색
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toggleScope("cafe_specific");
                        if (scope.includes("cafe"))
                          setScope((prev) => prev.filter((x) => x !== "cafe"));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${scope.includes("cafe_specific") ? "bg-emerald-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"}`}
                    >
                      {"📌 지정 카페"}
                    </button>
                  </div>
                  {hasCafeSpecific && (
                    <div className="ml-2 space-y-2 mt-2">
                      {targetCafes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={c.url}
                            onChange={(e) =>
                              updateCafe(i, "url", e.target.value)
                            }
                            className={`${inputCls} flex-1`}
                            placeholder="카페 URL"
                          />
                          <input
                            value={c.name || ""}
                            onChange={(e) =>
                              updateCafe(i, "name", e.target.value)
                            }
                            className="w-20 px-2 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-xs"
                            placeholder="별칭"
                          />
                          <button
                            type="button"
                            onClick={() => removeCafe(i)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addCafe}
                        className="text-xs text-emerald-600 hover:underline"
                      >
                        {"+ 카페 URL 추가"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
                  수집 방식
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "api", label: "API", desc: "빠르고 안정적" },
                    {
                      val: "hybrid",
                      label: "API + 크롤링",
                      desc: "본문 보강 포함",
                    },
                  ].map((m) => (
                    <button
                      key={m.val}
                      type="button"
                      onClick={() => setCrawlingMethod(m.val)}
                      className={`p-3 rounded-xl border-2 text-center text-xs transition-all ${crawlingMethod === m.val ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20" : "border-[hsl(var(--border))]"}`}
                    >
                      <span className="font-bold block">{m.label}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {m.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
                  검색 정렬
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      val: "latest" as const,
                      label: "최신순",
                      desc: "날짜 기준 정렬",
                    },
                    {
                      val: "accuracy" as const,
                      label: "정확도순",
                      desc: "관련도 기준 정렬",
                    },
                  ].map((m) => (
                    <button
                      key={m.val}
                      type="button"
                      onClick={() => setSearchType(m.val)}
                      className={`p-3 rounded-xl border-2 text-center text-xs transition-all ${searchType === m.val ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20" : "border-[hsl(var(--border))]"}`}
                    >
                      <span className="font-bold block">{m.label}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {m.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {templateType === "place" && (
            <div>
              <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-2">
                플레이스 URL *
              </label>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">
                리뷰를 수집할 플레이스 페이지 URL을 입력하세요.
              </p>
              <div className="space-y-3">
                {targetPlaces.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0 ${p.platform === "kakaomap" ? "bg-yellow-500" : p.platform === "googleplace" ? "bg-blue-500" : "bg-green-500"}`}
                    >
                      {p.platform === "kakaomap"
                        ? "K"
                        : p.platform === "googleplace"
                          ? "G"
                          : "N"}
                    </span>
                    <input
                      value={p.url}
                      onChange={(e) => updatePlace(i, "url", e.target.value)}
                      className={`${inputCls} flex-1`}
                      placeholder={
                        p.platform === "kakaomap"
                          ? "https://place.map.kakao.com/..."
                          : p.platform === "googleplace"
                            ? "https://maps.google.com/maps/place/..."
                            : "https://map.naver.com/p/entry/place/..."
                      }
                    />
                    <input
                      value={p.name || ""}
                      onChange={(e) => updatePlace(i, "name", e.target.value)}
                      className="w-24 px-2 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-xs"
                      placeholder="별칭"
                    />
                    {(p.platform === 'kakaomap' || p.platform === 'googleplace') && (
                      <select
                        value={p.sortOrder || 'relevant'}
                        onChange={(e) => updatePlace(i, 'sortOrder', e.target.value)}
                        className="w-20 px-1 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-xs"
                      >
                        <option value="latest">최신순</option>
                        <option value="relevant">정확도순</option>
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => removePlace(i)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => addPlace("naverplace")}
                  className="text-xs text-green-600 hover:underline font-medium"
                >
                  {"+ 네이버 플레이스"}
                </button>
                <button
                  type="button"
                  onClick={() => addPlace("kakaomap")}
                  className="text-xs text-yellow-600 hover:underline font-medium"
                >
                  {"+ 카카오맵"}
                </button>
                <button
                  type="button"
                  onClick={() => addPlace("googleplace")}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  {"+ 구글 플레이스"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
              {"수집 개수: "}
              <span className="text-violet-600">
                {collectCount}
                {"개"}
              </span>
              <span className="text-xs text-[hsl(var(--muted-foreground))] ml-2">
                {"(최대 "}
                {templateType === "place" ? "100" : "50"}
                {"개)"}
              </span>
            </label>
            <input
              type="range"
              min={5}
              max={templateType === "place" ? 100 : 50}
              step={5}
              value={collectCount}
              onChange={(e) => setCollectCount(parseInt(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>{"5개"}</span>
              <span>{templateType === "place" ? "100개" : "50개"}</span>
            </div>
          </div>

          <div className="border border-[hsl(var(--border))] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
                {"🕐 자동 실행"}
              </label>
              <button
                type="button"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${scheduleEnabled ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scheduleEnabled ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
            {scheduleEnabled && (
              <div className="mt-3">
                <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">
                  매일 실행 시간
                </label>
                <select
                  value={scheduleHour}
                  onChange={(e) => setScheduleHour(parseInt(e.target.value))}
                  className={inputCls}
                >
                  <option value={-1}>⚡ 2분마다 (테스트)</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
                <p className="text-xs text-violet-600 mt-1">
                  {scheduleHour === -1
                    ? "⚡ 2분마다 자동 실행됩니다 (테스트용)"
                    : `매일 ${String(scheduleHour).padStart(2, "0")}:00에 자동 실행됩니다`}
                </p>
              </div>
            )}
          </div>

          <div className="border border-[hsl(var(--border))] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
                {"🔔 Telegram 알림"}
              </label>
              <button
                type="button"
                onClick={() => setNotifyEnabled(!notifyEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${notifyEnabled ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyEnabled ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
            {notifyEnabled && (
              <p className="text-xs text-green-600 mt-2">
                모니터링 완료 시 거래처에게 Telegram 알림이 자동 발송됩니다
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-[hsl(var(--border))] rounded-xl text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : isEdit ? "수정" : "생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MonitoringPage;

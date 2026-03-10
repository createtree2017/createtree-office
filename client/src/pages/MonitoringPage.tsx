import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Plus, Play, Trash2, FileDown, FileText, RefreshCw, BarChart3, TrendingUp, TrendingDown, Minus, X, Eye, Clock, AlertCircle, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '/api/monitoring';
const getHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
});
const getAuthOnly = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Template { id: number; name: string; clientId: number; keywords: string[]; monitoringScope: string[]; isActive: boolean; collectCount: number; searchType: string; dateRange: number; crawlingMethod: string; analysisMode: string; createdAt: string; }
interface Result { id: number; templateId: number; clientId: number; status: string; summary: string | null; executionTimeMs: number | null; driveFileId: string | null; createdAt: string; posts: any[] | null; statistics: any | null; }
interface Client { id: number; name: string; }

const MonitoringPage = () => {
    const [tab, setTab] = useState<'dashboard' | 'templates' | 'results'>('dashboard');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [results, setResults] = useState<Result[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);
    const [reportHtml, setReportHtml] = useState<string | null>(null);
    const [executing, setExecuting] = useState<Set<number>>(new Set());

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [tRes, rRes, cRes] = await Promise.all([
                fetch(`${API}/templates`, { headers: getHeaders() }),
                fetch(`${API}/results`, { headers: getHeaders() }),
                fetch('/api/clients', { headers: getHeaders() }),
            ]);
            const tData = await tRes.json();
            const rData = await rRes.json();
            const cData = await cRes.json();
            if (tData.success) setTemplates(tData.data);
            if (rData.success) setResults(rData.data);
            if (cData.success) setClients(cData.data);
        } catch { toast.error('데이터 로드 실패'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // 실행 중인 결과 자동 새로고침
    useEffect(() => {
        const hasRunning = results.some(r => r.status === 'RUNNING' || r.status === 'PENDING');
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

    const executeMonitoring = async (templateId: number) => {
        setExecuting(prev => new Set(prev).add(templateId));
        try {
            const res = await fetch(`${API}/templates/${templateId}/execute`, { method: 'POST', headers: getHeaders() });
            const data = await res.json();
            if (data.success) { toast.success('모니터링이 시작되었습니다!'); fetchData(); }
            else toast.error(data.message || '실행 실패');
        } catch { toast.error('실행 실패'); }
        setExecuting(prev => { const s = new Set(prev); s.delete(templateId); return s; });
    };

    const deleteTemplate = async (id: number) => {
        if (!confirm('이 템플릿과 관련 결과를 모두 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`${API}/templates/${id}`, { method: 'DELETE', headers: getHeaders() });
            if ((await res.json()).success) { toast.success('삭제 완료'); fetchData(); }
        } catch { toast.error('삭제 실패'); }
    };

    const downloadExcel = async (resultId: number) => {
        try {
            const res = await fetch(`${API}/results/${resultId}/excel`, { headers: getAuthOnly() });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `monitoring_report_${resultId}.xlsx`; a.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('다운로드 실패'); }
    };

    // ★ 수정: fetch로 HTML 가져와서 새 탭에 Blob URL로 표시 (인증 토큰 포함)
    const viewReport = async (resultId: number) => {
        try {
            const res = await fetch(`${API}/results/${resultId}/report`, { headers: getAuthOnly() });
            if (!res.ok) { toast.error('보고서 로드 실패'); return; }
            const html = await res.text();
            const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch { toast.error('보고서 보기 실패'); }
    };

    // ★ 수정: 앱 내부 모달로 HTML 보고서 표시
    const viewReportInModal = async (resultId: number) => {
        try {
            const res = await fetch(`${API}/results/${resultId}/report`, { headers: getAuthOnly() });
            if (!res.ok) { toast.error('보고서 로드 실패'); return; }
            const html = await res.text();
            setReportHtml(html);
        } catch { toast.error('보고서 보기 실패'); }
    };

    const getStatusBadge = (status: string) => {
        const map: Record<string, { label: string; cls: string }> = {
            RUNNING: { label: '실행중', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
            COMPLETED: { label: '완료', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
            FAILED: { label: '실패', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
            PENDING: { label: '대기', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
            CANCELLED: { label: '취소', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
        };
        const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>;
    };

    const getSentimentIcon = (sentiment?: string) => {
        if (sentiment === 'positive') return <TrendingUp size={16} className="text-green-500" />;
        if (sentiment === 'negative') return <TrendingDown size={16} className="text-red-500" />;
        return <Minus size={16} className="text-yellow-500" />;
    };

    const completedResults = results.filter(r => r.status === 'COMPLETED');
    const totalPosts = completedResults.reduce((sum, r) => sum + (r.posts?.length || 0), 0);
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
                            <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">모니터링</h1>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">온라인 평판 모니터링 및 AI 감성 분석</p>
                        </div>
                    </div>
                    <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-semibold transition-colors shadow-md">
                        <Plus size={16} /> 새 템플릿
                    </button>
                </div>

                {/* 탭 */}
                <div className="flex gap-1 mb-6 bg-[hsl(var(--card))] p-1 rounded-xl border border-[hsl(var(--border))] w-fit">
                    {[
                        { key: 'dashboard', label: '대시보드', icon: BarChart3 },
                        { key: 'templates', label: '템플릿', icon: Activity },
                        { key: 'results', label: '결과 목록', icon: FileText },
                    ].map(t => (
                        <button key={t.key} onClick={() => setTab(t.key as any)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'}`}>
                            <t.icon size={14} /> {t.label}
                        </button>
                    ))}
                </div>

                {/* ========== 대시보드 탭 ========== */}
                {tab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: '총 템플릿', value: templates.length },
                                { label: '총 분석 횟수', value: completedResults.length },
                                { label: '수집된 게시글', value: totalPosts },
                                { label: '최근 감성', value: latestResult?.statistics?.overall_sentiment === 'positive' ? '긍정적 😊' : latestResult?.statistics?.overall_sentiment === 'negative' ? '부정적 😟' : '중립 😐' },
                            ].map((s, i) => (
                                <div key={i} className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
                                    <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">{s.label}</p>
                                    <p className="text-2xl font-bold text-[hsl(var(--foreground))]">{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {latestResult?.statistics && (
                            <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-6">
                                <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2"><BarChart3 size={18} /> 최근 분석 결과</h3>
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    {[
                                        { label: '긍정', pct: latestResult.statistics.sentiment_distribution?.percentage?.positive || 0, cls: 'text-green-600 dark:text-green-400', bg: 'bg-green-500' },
                                        { label: '중립', pct: latestResult.statistics.sentiment_distribution?.percentage?.neutral || 0, cls: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500' },
                                        { label: '부정', pct: latestResult.statistics.sentiment_distribution?.percentage?.negative || 0, cls: 'text-red-600 dark:text-red-400', bg: 'bg-red-500' },
                                    ].map((s, i) => (
                                        <div key={i} className="text-center">
                                            <p className={`text-2xl font-bold ${s.cls}`}>{s.pct}%</p>
                                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
                                            <div className="mt-2 h-2 bg-[hsl(var(--accent))] rounded-full overflow-hidden">
                                                <div className={`h-full ${s.bg} rounded-full transition-all`} style={{ width: `${s.pct}%` }} />
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
                                <span className="flex items-center gap-2"><Clock size={18} /> 최근 활동</span>
                                <button onClick={fetchData} className="text-xs text-violet-600 hover:underline flex items-center gap-1"><RefreshCw size={12} /> 새로고침</button>
                            </h3>
                            <div className="space-y-2">
                                {results.slice(0, 5).map(r => {
                                    const tpl = templates.find(t => t.id === r.templateId);
                                    return (
                                        <div key={r.id} onClick={() => r.status === 'COMPLETED' && setSelectedResult(r)} className={`flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--border))] ${r.status === 'COMPLETED' ? 'cursor-pointer hover:bg-[hsl(var(--accent))]' : ''} transition-colors`}>
                                            <div className="flex items-center gap-3">
                                                {getSentimentIcon(r.statistics?.overall_sentiment)}
                                                <div>
                                                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">{tpl?.name || `템플릿 #${r.templateId}`}</p>
                                                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(r.createdAt).toLocaleString('ko-KR')}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(r.status)}
                                                {r.status === 'RUNNING' && <RefreshCw size={14} className="text-blue-500 animate-spin" />}
                                            </div>
                                        </div>
                                    );
                                })}
                                {results.length === 0 && <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">아직 모니터링 결과가 없습니다. 템플릿을 만들고 실행해보세요!</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* ========== 템플릿 탭 ========== */}
                {tab === 'templates' && (
                    <div className="space-y-3">
                        {templates.length === 0 && (
                            <div className="text-center py-16 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
                                <Activity size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                                <p className="text-[hsl(var(--muted-foreground))]">모니터링 템플릿이 없습니다.</p>
                                <button onClick={() => setShowCreate(true)} className="mt-3 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold">새 템플릿 만들기</button>
                            </div>
                        )}
                        {templates.map(t => (
                            <div key={t.id} className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className="font-semibold text-[hsl(var(--foreground))]">{t.name}</h3>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500'}`}>{t.isActive ? '활성' : '비활성'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {t.keywords.map((k, i) => <span key={i} className="px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded-full text-xs font-medium">{k}</span>)}
                                    </div>
                                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                        범위: {t.monitoringScope?.join(', ')} | 거래처: {clients.find(c => c.id === t.clientId)?.name || t.clientId} | 수집: {t.collectCount}건
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button onClick={() => executeMonitoring(t.id)} disabled={executing.has(t.id)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                        {executing.has(t.id) ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                                        {executing.has(t.id) ? '실행중...' : '실행'}
                                    </button>
                                    <button onClick={() => setEditingTemplate(t)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="수정">
                                        <Pencil size={16} />
                                    </button>
                                    <button onClick={() => deleteTemplate(t.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="삭제">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ========== 결과 목록 탭 ========== */}
                {tab === 'results' && (
                    <div className="space-y-3">
                        {results.length === 0 && (
                            <div className="text-center py-16 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
                                <FileText size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                                <p className="text-[hsl(var(--muted-foreground))]">모니터링 결과가 없습니다.</p>
                            </div>
                        )}
                        {results.map(r => {
                            const tpl = templates.find(t => t.id === r.templateId);
                            return (
                                <div key={r.id} onClick={() => r.status === 'COMPLETED' && setSelectedResult(r)} className={`bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 flex items-center justify-between ${r.status === 'COMPLETED' ? 'cursor-pointer hover:border-violet-300 dark:hover:border-violet-700' : ''} transition-colors`}>
                                    <div className="flex items-center gap-3">
                                        {getSentimentIcon(r.statistics?.overall_sentiment)}
                                        <div>
                                            <p className="font-semibold text-sm text-[hsl(var(--foreground))]">{tpl?.name || `#${r.templateId}`}</p>
                                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(r.createdAt).toLocaleString('ko-KR')} {r.executionTimeMs ? `• ${(r.executionTimeMs / 1000).toFixed(1)}초` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {r.status === 'COMPLETED' && r.posts && <span className="text-xs text-[hsl(var(--muted-foreground))]">{r.posts.length}건</span>}
                                        {getStatusBadge(r.status)}
                                        {r.status === 'COMPLETED' && (
                                            <div className="flex gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); downloadExcel(r.id); }} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="엑셀 다운로드">
                                                    <FileDown size={16} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); viewReportInModal(r.id); }} className="p-1.5 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg" title="HTML 보고서 보기">
                                                    <Eye size={16} />
                                                </button>
                                            </div>
                                        )}
                                        {r.status === 'RUNNING' && <RefreshCw size={14} className="text-blue-500 animate-spin" />}
                                        {r.status === 'FAILED' && <AlertCircle size={14} className="text-red-500" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ========== 결과 상세 모달 ========== */}
            {selectedResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setSelectedResult(null)}>
                    <div className="bg-[hsl(var(--card))] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                            <div>
                                <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">분석 결과 상세</h2>
                                <p className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(selectedResult.createdAt).toLocaleString('ko-KR')}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => downloadExcel(selectedResult.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"><FileDown size={14} /> 엑셀</button>
                                <button onClick={() => viewReport(selectedResult.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700"><Eye size={14} /> 보고서</button>
                                <button onClick={() => setSelectedResult(null)} className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={20} /></button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {selectedResult.statistics && (
                                <div>
                                    <h3 className="font-semibold mb-3 text-[hsl(var(--foreground))]">📊 감성 분석</h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { label: '긍정', pct: selectedResult.statistics.sentiment_distribution?.percentage?.positive || 0, count: selectedResult.statistics.sentiment_distribution?.positive || 0, cls: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
                                            { label: '중립', pct: selectedResult.statistics.sentiment_distribution?.percentage?.neutral || 0, count: selectedResult.statistics.sentiment_distribution?.neutral || 0, cls: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
                                            { label: '부정', pct: selectedResult.statistics.sentiment_distribution?.percentage?.negative || 0, count: selectedResult.statistics.sentiment_distribution?.negative || 0, cls: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
                                        ].map((s, i) => (
                                            <div key={i} className={`${s.bg} rounded-xl p-4 text-center`}>
                                                <p className={`text-3xl font-bold ${s.cls}`}>{s.pct}%</p>
                                                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{s.label} ({s.count}건)</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedResult.summary && (
                                <div>
                                    <h3 className="font-semibold mb-2 text-[hsl(var(--foreground))]">💡 AI 분석 요약</h3>
                                    <div className="bg-[hsl(var(--accent))] rounded-lg p-4 text-sm text-[hsl(var(--foreground))] leading-relaxed">{selectedResult.summary}</div>
                                </div>
                            )}
                            {selectedResult.posts && selectedResult.posts.length > 0 && (
                                <div>
                                    <h3 className="font-semibold mb-2 text-[hsl(var(--foreground))]">📋 수집 게시글 ({selectedResult.posts.length}건)</h3>
                                    <div className="space-y-2 max-h-80 overflow-y-auto">
                                        {selectedResult.posts.slice(0, 30).map((p: any, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--border))] text-sm">
                                                <span className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 w-6">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-[hsl(var(--foreground))] hover:text-violet-600 truncate block">{p.title}</a>
                                                    <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">{p.content?.substring(0, 80)}...</p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${p.sentiment === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : p.sentiment === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                                    {p.sentiment === 'positive' ? '긍정' : p.sentiment === 'negative' ? '부정' : '중립'}
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
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setReportHtml(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-3 border-b">
                            <h2 className="font-bold text-gray-900">📊 HTML 보고서</h2>
                            <div className="flex gap-2">
                                <button onClick={() => { const blob = new Blob([reportHtml], { type: 'text/html' }); const url = URL.createObjectURL(blob); window.open(url, '_blank'); }} className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700">새 탭에서 보기</button>
                                <button onClick={() => setReportHtml(null)} className="p-1.5 text-gray-400 hover:text-gray-700"><X size={20} /></button>
                            </div>
                        </div>
                        <iframe srcDoc={reportHtml} className="flex-1 w-full border-0 rounded-b-2xl" title="모니터링 보고서" sandbox="allow-same-origin" />
                    </div>
                </div>
            )}

            {/* ========== 템플릿 생성 모달 ========== */}
            {showCreate && <TemplateFormModal mode="create" clients={clients} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchData(); }} />}

            {/* ========== 템플릿 수정 모달 ========== */}
            {editingTemplate && <TemplateFormModal mode="edit" template={editingTemplate} clients={clients} onClose={() => setEditingTemplate(null)} onSaved={() => { setEditingTemplate(null); fetchData(); }} />}
        </div>
    );
};

// ===== 통합 템플릿 폼 모달 (생성/수정 겸용) =====
const TemplateFormModal = ({ mode, template, clients, onClose, onSaved }: {
    mode: 'create' | 'edit';
    template?: Template;
    clients: Client[];
    onClose: () => void;
    onSaved: () => void;
}) => {
    const [name, setName] = useState(template?.name || '');
    const [clientId, setClientId] = useState(template?.clientId?.toString() || '');
    const [keywordsStr, setKeywordsStr] = useState(template?.keywords?.join(', ') || '');
    const [scope, setScope] = useState<string[]>(template?.monitoringScope || ['blog', 'cafe']);
    const [collectCount, setCollectCount] = useState(template?.collectCount || 10);
    const [isActive, setIsActive] = useState(template?.isActive ?? true);
    const [crawlingMethod, setCrawlingMethod] = useState(template?.crawlingMethod || 'api');
    const [saving, setSaving] = useState(false);
    const [targetPlaces, setTargetPlaces] = useState<Array<{ platform: string; url: string; name?: string }>>(
        (template as any)?.targetPlaces || []
    );
    const [targetCafes, setTargetCafes] = useState<Array<{ url: string; name?: string }>>(
        (template as any)?.targetCafes || []
    );

    const isEdit = mode === 'edit';
    const hasPlaceScope = scope.some(s => ['naverplace', 'kakaomap'].includes(s));
    const hasCafeSpecific = scope.includes('cafe_specific');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !clientId || !keywordsStr.trim()) { toast.error('필수 항목을 입력해주세요.'); return; }
        if (hasPlaceScope && targetPlaces.filter(p => p.url.trim()).length === 0) { toast.error('플레이스 URL을 입력해주세요.'); return; }
        if (hasCafeSpecific && targetCafes.filter(c => c.url.trim()).length === 0) { toast.error('지정 카페 URL을 입력해주세요.'); return; }

        const finalMethod = (hasPlaceScope || hasCafeSpecific) ? 'hybrid' : crawlingMethod;
        setSaving(true);
        try {
            const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
            const body = {
                name, clientId: parseInt(clientId), keywords, monitoringScope: scope,
                collectCount, isActive, crawlingMethod: finalMethod,
                targetPlaces: hasPlaceScope ? targetPlaces.filter(p => p.url.trim()) : null,
                targetCafes: hasCafeSpecific ? targetCafes.filter(c => c.url.trim()) : null,
            };
            const url = isEdit ? `${API}/templates/${template!.id}` : `${API}/templates`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(body) });
            const data = await res.json();
            if (data.success) { toast.success(isEdit ? '템플릿 수정 완료!' : '템플릿 생성 완료!'); onSaved(); }
            else toast.error(data.message || '저장 실패');
        } catch { toast.error('저장 실패'); }
        setSaving(false);
    };

    const toggleScope = (s: string) => setScope(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    const addPlace = (platform: string) => setTargetPlaces(prev => [...prev, { platform, url: '', name: '' }]);
    const removePlace = (idx: number) => setTargetPlaces(prev => prev.filter((_, i) => i !== idx));
    const updatePlace = (idx: number, field: string, value: string) => setTargetPlaces(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    const addCafe = () => setTargetCafes(prev => [...prev, { url: '', name: '' }]);
    const removeCafe = (idx: number) => setTargetCafes(prev => prev.filter((_, i) => i !== idx));
    const updateCafe = (idx: number, field: string, value: string) => setTargetCafes(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));

    const inputCls = "w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-violet-500";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
            <div className="bg-[hsl(var(--card))] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 z-10 bg-[hsl(var(--card))] px-6 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between rounded-t-2xl">
                    <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">{isEdit ? '모니터링 템플릿 수정' : '새 모니터링 템플릿'}</h2>
                    <button onClick={onClose} className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">템플릿 이름 *</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: A병원 온라인 평판" className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">거래처 *</label>
                        <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
                            <option value="">선택하세요</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">키워드 * <span className="text-xs text-[hsl(var(--muted-foreground))]">(쉼표로 구분)</span></label>
                        <input value={keywordsStr} onChange={e => setKeywordsStr(e.target.value)} placeholder="예: A병원 후기, A병원 리뷰" className={inputCls} />
                    </div>

                    {/* ========== 모니터링 범위 ========== */}
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">모니터링 범위</label>
                        <div className="space-y-3">
                            {/* 네이버 검색 API */}
                            <div>
                                <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5">🔍 네이버 검색 (API)</p>
                                <div className="flex flex-wrap gap-2">
                                    {[{ key: 'blog', label: '블로그' }, { key: 'news', label: '뉴스' }].map(s => (
                                        <button key={s.key} type="button" onClick={() => toggleScope(s.key)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope.includes(s.key) ? 'bg-violet-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))]'}`}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 카페 */}
                            <div>
                                <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5">☕ 카페</p>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => toggleScope('cafe')}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope.includes('cafe') ? 'bg-violet-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))]'}`}>
                                        전체 검색
                                    </button>
                                    <button type="button" onClick={() => toggleScope('cafe_specific')}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope.includes('cafe_specific') ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))]'}`}>
                                        📌 지정 카페
                                    </button>
                                </div>
                                {hasCafeSpecific && (
                                    <div className="mt-2 space-y-2 pl-3 border-l-2 border-emerald-300 dark:border-emerald-700">
                                        {targetCafes.map((cafe, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input value={cafe.url} onChange={e => updateCafe(i, 'url', e.target.value)} placeholder="https://cafe.naver.com/카페명" className={`flex-1 ${inputCls} !py-1.5 !text-xs`} />
                                                <input value={cafe.name || ''} onChange={e => updateCafe(i, 'name', e.target.value)} placeholder="별칭" className={`w-24 ${inputCls} !py-1.5 !text-xs`} />
                                                <button type="button" onClick={() => removeCafe(i)} className="p-1 text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={addCafe} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">+ 카페 URL 추가</button>
                                    </div>
                                )}
                            </div>
                            {/* 플레이스 */}
                            <div>
                                <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5">🏥 플레이스 리뷰 (크롤링)</p>
                                <div className="flex flex-wrap gap-2">
                                    {[{ key: 'naverplace', label: '네이버 플레이스' }, { key: 'kakaomap', label: '카카오맵' }].map(s => (
                                        <button key={s.key} type="button" onClick={() => {
                                            toggleScope(s.key);
                                            if (!scope.includes(s.key) && !targetPlaces.some(p => p.platform === s.key)) {
                                                addPlace(s.key);
                                            }
                                        }}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope.includes(s.key) ? 'bg-orange-500 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))]'}`}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                                {hasPlaceScope && (
                                    <div className="mt-2 space-y-2 pl-3 border-l-2 border-orange-300 dark:border-orange-700">
                                        {targetPlaces.map((place, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${place.platform === 'naverplace' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                                    {place.platform === 'naverplace' ? 'N' : 'K'}
                                                </span>
                                                <input value={place.url} onChange={e => updatePlace(i, 'url', e.target.value)}
                                                    placeholder={place.platform === 'naverplace' ? 'https://map.naver.com/p/entry/place/123456' : 'https://place.map.kakao.com/123456'}
                                                    className={`flex-1 ${inputCls} !py-1.5 !text-xs`} />
                                                <button type="button" onClick={() => removePlace(i)} className="p-1 text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
                                            </div>
                                        ))}
                                        <div className="flex gap-3">
                                            {scope.includes('naverplace') && <button type="button" onClick={() => addPlace('naverplace')} className="text-xs text-green-600 dark:text-green-400 hover:underline font-medium">+ 네이버 플레이스</button>}
                                            {scope.includes('kakaomap') && <button type="button" onClick={() => addPlace('kakaomap')} className="text-xs text-yellow-600 dark:text-yellow-400 hover:underline font-medium">+ 카카오맵</button>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 수집 방식 */}
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">수집 방식</label>
                        <div className="flex gap-2">
                            {[
                                { key: 'api', label: 'API', desc: '빠르고 안정적' },
                                { key: 'hybrid', label: 'API + 크롤링', desc: '본문 보강 포함' },
                            ].map(m => (
                                <button key={m.key} type="button" onClick={() => setCrawlingMethod(m.key)}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border-2 text-center ${(crawlingMethod === m.key || (m.key === 'hybrid' && (hasPlaceScope || hasCafeSpecific))) ? 'border-violet-600 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-violet-300'}`}>
                                    <div className="font-semibold">{m.label}</div>
                                    <div className="text-[10px] mt-0.5 opacity-70">{m.desc}</div>
                                </button>
                            ))}
                        </div>
                        {(hasPlaceScope || hasCafeSpecific) && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">ℹ️ 플레이스/지정카페 선택 시 자동으로 크롤링 모드 적용</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">수집 개수</label>
                        <input type="number" value={collectCount} onChange={e => setCollectCount(parseInt(e.target.value) || 10)} min={5} max={100} className={inputCls} />
                    </div>
                    {isEdit && (
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-[hsl(var(--foreground))]">활성 상태</label>
                            <button type="button" onClick={() => setIsActive(!isActive)} className={`w-10 h-6 rounded-full transition-colors relative ${isActive ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${isActive ? 'left-5' : 'left-1'}`} />
                            </button>
                            <span className="text-xs text-[hsl(var(--muted-foreground))]">{isActive ? '활성' : '비활성'}</span>
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-[hsl(var(--border))] rounded-lg text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]">취소</button>
                        <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">{saving ? '저장중...' : (isEdit ? '수정' : '생성')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MonitoringPage;


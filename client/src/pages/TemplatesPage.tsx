import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Save, MoveUp, MoveDown, FileText, CheckSquare, Edit, Activity, Play, Pencil, RefreshCw, Square, LayoutTemplate } from 'lucide-react';
import { TemplateFormModal, MonitoringTemplate, MonitoringClient } from './MonitoringPage';

// ===== 업무 템플릿 타입 =====
type QuestionType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'file' | 'date' | 'date_range';

interface Option {
    id: string;
    text: string;
}

interface Question {
    id: string;
    type: QuestionType;
    title: string;
    options?: Option[];
    required: boolean;
}

interface Template {
    id: number;
    title: string;
    description: string;
    formSchema: Question[];
    authorName?: string;
    createdAt: string;
}

const MAPI = "/api/monitoring";
const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const TemplatesPage: React.FC = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    // 탭 상태
    const [activeTab, setActiveTab] = useState<'task' | 'monitoring'>('task');

    // ===== 업무 템플릿 상태 =====
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);

    // ===== 템플릿 삭제 확인 모달 상태 =====
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        templateId: number | null;
        templateTitle: string;
        linkedTasks: { id: number; title: string; status: string; dueDate?: string }[];
        loading: boolean;
    }>({ open: false, templateId: null, templateTitle: '', linkedTasks: [], loading: false });

    // ===== 모니터링 템플릿 상태 =====
    const [monTemplates, setMonTemplates] = useState<MonitoringTemplate[]>([]);
    const [monClients, setMonClients] = useState<MonitoringClient[]>([]);
    const [monLoading, setMonLoading] = useState(false);
    const [showMonCreate, setShowMonCreate] = useState(false);
    const [editingMonTemplate, setEditingMonTemplate] = useState<MonitoringTemplate | null>(null);

    // ===== 업무 템플릿 로직 =====
    useEffect(() => {
        if (activeTab === 'task') fetchTemplates();
        else fetchMonitoringData();
    }, [activeTab]);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/templates', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            setTemplates(data);
        } catch (error) {
            toast.error('템플릿을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setIsEditing(true);
        setCurrentTemplateId(null);
        setTitle('');
        setDescription('');
        setQuestions([
            { id: Date.now().toString(), type: 'text', title: '새 질문', required: true }
        ]);
    };

    const handleEdit = (template: Template) => {
        setIsEditing(true);
        setCurrentTemplateId(template.id);
        setTitle(template.title);
        setDescription(template.description || '');
        setQuestions(template.formSchema);
    };

    const handleDelete = async (id: number, templateTitle: string) => {
        // 연결된 업무 목록 먼저 조회
        setDeleteConfirm({ open: true, templateId: id, templateTitle, linkedTasks: [], loading: true });
        try {
            const res = await fetch(`/api/templates/${id}/linked-tasks`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            setDeleteConfirm(prev => ({ ...prev, linkedTasks: data.tasks || [], loading: false }));
        } catch {
            setDeleteConfirm(prev => ({ ...prev, loading: false }));
        }
    };

    const confirmDelete = async () => {
        const id = deleteConfirm.templateId;
        if (!id) return;
        setDeleteConfirm(prev => ({ ...prev, loading: true }));
        try {
            const res = await fetch(`/api/templates/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message || '삭제 실패');
                return;
            }
            const data = await res.json();
            toast.success(data.message || '템플릿이 삭제되었습니다.');
            setDeleteConfirm({ open: false, templateId: null, templateTitle: '', linkedTasks: [], loading: false });
            fetchTemplates();
        } catch {
            toast.error('삭제 실패: 서버 통신 오류');
        } finally {
            setDeleteConfirm(prev => ({ ...prev, loading: false }));
        }
    };

    const handleAddQuestion = (type: QuestionType) => {
        const newQ: Question = { id: Date.now().toString(), type, title: '', required: false };
        if (type === 'radio' || type === 'checkbox' || type === 'select') {
            newQ.options = [{ id: Date.now().toString() + '-opt', text: '옵션 1' }];
        }
        setQuestions([...questions, newQ]);
    };

    const handleQuestionChange = (id: string, field: keyof Question, value: any) => {
        setQuestions(questions.map(q => {
            if (q.id !== id) return q;
            const updated = { ...q, [field]: value };
            // 타입 변경 시 options 자동 초기화
            if (field === 'type') {
                if ((value === 'radio' || value === 'checkbox' || value === 'select') && !q.options?.length) {
                    updated.options = [{ id: Date.now().toString() + '-opt', text: '옵션 1' }];
                } else if (value === 'text' || value === 'textarea' || value === 'file' || value === 'date' || value === 'date_range') {
                    updated.options = undefined;
                }
            }
            return updated;
        }));
    };

    const handleRemoveQuestion = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === questions.length - 1) return;
        const newQuestions = [...questions];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const temp = newQuestions[index];
        newQuestions[index] = newQuestions[targetIndex];
        newQuestions[targetIndex] = temp;
        setQuestions(newQuestions);
    };

    const handleAddOption = (questionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id !== questionId) return q;
            const currentOptions = q.options || [];
            return { ...q, options: [...currentOptions, { id: Date.now().toString(), text: `옵션 ${currentOptions.length + 1}` }] };
        }));
    };

    const handleOptionChange = (questionId: string, optionId: string, text: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId && q.options) {
                return { ...q, options: q.options.map(opt => opt.id === optionId ? { ...opt, text } : opt) };
            }
            return q;
        }));
    };

    const handleRemoveOption = (questionId: string, optionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId && q.options) {
                return { ...q, options: q.options.filter(opt => opt.id !== optionId) };
            }
            return q;
        }));
    };

    const handleSave = async () => {
        if (!title.trim()) return toast.error('템플릿 제목을 입력해주세요.');
        if (questions.length === 0) return toast.error('최소 1개 이상의 질문이 필요합니다.');
        try {
            const payload = { title, description, formSchema: questions };
            const method = currentTemplateId ? 'PUT' : 'POST';
            const url = currentTemplateId ? `/api/templates/${currentTemplateId}` : '/api/templates';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success(currentTemplateId ? '템플릿이 수정되었습니다.' : '새 템플릿이 생성되었습니다.');
                setIsEditing(false);
                fetchTemplates();
            } else {
                toast.error('저장 중 서버에서 오류를 반환했습니다.');
            }
        } catch (error) {
            toast.error('저장 중 통신 오류가 발생했습니다.');
        }
    };

    // ===== 모니터링 템플릿 로직 =====
    const fetchMonitoringData = useCallback(async () => {
        setMonLoading(true);
        try {
            const [tRes, cRes] = await Promise.all([
                fetch(`${MAPI}/templates`, { headers: getHeaders() }),
                fetch("/api/clients", { headers: getHeaders() }),
            ]);
            const tData = await tRes.json();
            const cData = await cRes.json();
            if (tData.success) setMonTemplates(tData.data);
            if (cData.success) setMonClients(cData.data);
        } catch {
            toast.error("모니터링 데이터 로드 실패");
        }
        setMonLoading(false);
    }, []);

    const deleteMonTemplate = async (id: number) => {
        if (!confirm("이 템플릿과 관련 결과를 모두 삭제하시겠습니까?")) return;
        try {
            const res = await fetch(`${MAPI}/templates/${id}`, { method: "DELETE", headers: getHeaders() });
            if ((await res.json()).success) {
                toast.success("삭제 완료");
                fetchMonitoringData();
            }
        } catch {
            toast.error("삭제 실패");
        }
    };

    const toggleSchedule = async (template: MonitoringTemplate) => {
        const newEnabled = !template.scheduleEnabled;
        try {
            const res = await fetch(`${MAPI}/templates/${template.id}`, {
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
                fetchMonitoringData();
            } else toast.error(data.message || "변경 실패");
        } catch {
            toast.error("변경 실패");
        }
    };

    // 관리자 또는 매니저만 접근 가능 표시
    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
        return <div className="p-8 text-center text-red-500">접근 권한이 없습니다.</div>;
    }

    // ===== 업무 템플릿 에디터 =====
    if (isEditing) {
        return (
            <div className="max-w-4xl mx-auto p-6 pt-24 space-y-6 pb-32">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">{currentTemplateId ? '템플릿 수정' : '새 업무 템플릿 만들기'}</h1>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-slate-700">취소</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2">
                            <Save className="w-4 h-4" /> 저장하기
                        </button>
                    </div>
                </div>

                <div className="bg-[hsl(var(--card))] p-6 rounded-lg shadow-sm border border-[hsl(var(--border))] space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">템플릿 제목 (예: 서포터즈 모집 보고서)</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full text-xl font-bold p-2 border-b border-[hsl(var(--border))] bg-transparent focus:border-blue-500 focus:outline-none text-[hsl(var(--foreground))]" placeholder="제목 없는 템플릿" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">템플릿 설명 (선택)</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border-b border-[hsl(var(--border))] bg-transparent focus:border-blue-500 focus:outline-none resize-none text-[hsl(var(--foreground))]" placeholder="이 템플릿에 대한 설명을 적어주세요." rows={2} />
                    </div>
                </div>

                <div className="space-y-4">
                    {questions.map((q, index) => (
                        <div key={q.id} className="bg-[hsl(var(--card))] p-5 rounded-lg shadow-sm border border-[hsl(var(--border))] flex gap-4">
                            <div className="flex flex-col gap-2 items-center text-[hsl(var(--muted-foreground))] mt-2">
                                <button onClick={() => handleMoveQuestion(index, 'up')} className="hover:text-blue-600 disabled:opacity-30" disabled={index === 0}><MoveUp className="w-4 h-4" /></button>
                                <span className="text-xs font-mono">{index + 1}</span>
                                <button onClick={() => handleMoveQuestion(index, 'down')} className="hover:text-blue-600 disabled:opacity-30" disabled={index === questions.length - 1}><MoveDown className="w-4 h-4" /></button>
                            </div>
                            <div className="flex-1 space-y-4">
                                <div className="flex gap-4">
                                    <input type="text" value={q.title} onChange={e => handleQuestionChange(q.id, 'title', e.target.value)} className="flex-1 p-2 bg-[hsl(var(--accent))] border-b border-[hsl(var(--border))] focus:border-blue-500 focus:bg-transparent focus:outline-none text-[hsl(var(--foreground))]" placeholder="질문 내용을 입력하세요" />
                                    <select value={q.type} onChange={e => handleQuestionChange(q.id, 'type', e.target.value)} className="p-2 border rounded bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]">
                                        <option value="text">단답형</option>
                                        <option value="textarea">장문형</option>
                                        <option value="radio">객관식 (단일)</option>
                                        <option value="checkbox">체크박스 (다중)</option>
                                        <option value="select">드롭다운</option>
                                        <option value="file">파일 업로드 (드라이브)</option>
                                        <option value="date">📅 날짜 (단일)</option>
                                        <option value="date_range">📅 날짜 (기간: 시작일~종료일)</option>
                                    </select>
                                </div>
                                {(q.type === 'radio' || q.type === 'checkbox' || q.type === 'select') && (
                                    <div className="pl-4 space-y-2">
                                        {q.options?.map((opt) => (
                                            <div key={opt.id} className="flex items-center gap-2">
                                                <div className="w-4 h-4 border rounded-full border-[hsl(var(--border))] flex-shrink-0" />
                                                <input type="text" value={opt.text} onChange={e => handleOptionChange(q.id, opt.id, e.target.value)} className="flex-1 p-1 border-b border-[hsl(var(--border))] bg-transparent focus:border-blue-500 focus:outline-none text-[hsl(var(--foreground))]" />
                                                <button onClick={() => handleRemoveOption(q.id, opt.id)} className="text-[hsl(var(--muted-foreground))] hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        <button onClick={() => handleAddOption(q.id)} className="text-sm text-blue-600 hover:underline mt-2">옵션 추가</button>
                                    </div>
                                )}
                                <div className="flex justify-end items-center gap-4 pt-4 border-t border-[hsl(var(--border))] mt-4">
                                    <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] cursor-pointer">
                                        <input type="checkbox" checked={q.required} onChange={e => handleQuestionChange(q.id, 'required', e.target.checked)} className="rounded text-blue-600" />
                                        필수 문항
                                    </label>
                                    <button onClick={() => handleRemoveQuestion(q.id)} className="text-[hsl(var(--muted-foreground))] hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-2 shadow-sm flex justify-center gap-4 sticky bottom-4 mx-auto max-w-max">
                    <button onClick={() => handleAddQuestion('text')} className="flex flex-col items-center p-2 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--foreground))]" title="텍스트 질문 추가">
                        <FileText className="w-5 h-5 mb-1" /><span className="text-xs">단답형</span>
                    </button>
                    <button onClick={() => handleAddQuestion('radio')} className="flex flex-col items-center p-2 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--foreground))]" title="객관식 질문 추가">
                        <CheckSquare className="w-5 h-5 mb-1" /><span className="text-xs">객관식</span>
                    </button>
                    <button onClick={() => handleAddQuestion('select')} className="flex flex-col items-center p-2 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--foreground))]" title="드롭다운 추가">
                        <Square className="w-5 h-5 mb-1" /><span className="text-xs">드롭다운</span>
                    </button>
                    <button onClick={() => handleAddQuestion('file')} className="flex flex-col items-center p-2 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--foreground))]" title="파일 업로드 추가">
                        <Plus className="w-5 h-5 mb-1" /><span className="text-xs">파일첨부</span>
                    </button>
                    <button onClick={() => handleAddQuestion('date')} className="flex flex-col items-center p-2 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--foreground))]" title="날짜(단일) 추가">
                        <span className="text-lg mb-0.5">📅</span><span className="text-xs">단일날짜</span>
                    </button>
                    <button onClick={() => handleAddQuestion('date_range')} className="flex flex-col items-center p-2 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--foreground))]" title="날짜(기간) 추가">
                        <span className="text-lg mb-0.5">🗓️</span><span className="text-xs">기간날짜</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="pt-14 min-h-screen bg-[hsl(var(--background))]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                            <LayoutTemplate size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">템플릿 관리</h1>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">업무 양식 및 모니터링 템플릿을 관리합니다.</p>
                        </div>
                    </div>
                    {activeTab === 'task' && (
                        <button onClick={handleCreateNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors shadow-md">
                            <Plus size={16} /> 템플릿 쓰기
                        </button>
                    )}
                    {activeTab === 'monitoring' && (
                        <button onClick={() => setShowMonCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-semibold transition-colors shadow-md">
                            <Plus size={16} /> 새 모니터링 템플릿
                        </button>
                    )}
                </div>

                {/* 탭 */}
                <div className="flex gap-1 mb-6 bg-[hsl(var(--card))] p-1 rounded-xl border border-[hsl(var(--border))] w-fit">
                    {[
                        { key: 'task', label: '업무 템플릿', icon: FileText },
                        { key: 'monitoring', label: '모니터링 템플릿', icon: Activity },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key as any)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'}`}
                        >
                            <t.icon size={14} /> {t.label}
                        </button>
                    ))}
                </div>

                {/* ========== 업무 템플릿 탭 ========== */}
                {activeTab === 'task' && (
                    <>
                        {loading ? (
                            <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">불러오는 중...</div>
                        ) : templates.length === 0 ? (
                            <div className="text-center py-20 bg-[hsl(var(--card))] border border-dashed border-[hsl(var(--border))] rounded-xl">
                                <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">템플릿이 없습니다.</h3>
                                <p className="text-[hsl(var(--muted-foreground))] mt-2">첫 번째 업무 양식을 만들어보세요!</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {templates.map(tpl => (
                                    <div key={tpl.id} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden hover:shadow-lg transition flex flex-col group">
                                        <div className="p-5 flex-1 cursor-pointer" onClick={() => handleEdit(tpl)}>
                                            <h3 className="text-lg font-bold text-[hsl(var(--foreground))] group-hover:text-blue-600 transition">{tpl.title}</h3>
                                            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 line-clamp-2">{tpl.description || '설명 없음'}</p>
                                        </div>
                                        <div className="bg-[hsl(var(--accent))] p-4 border-t border-[hsl(var(--border))] flex items-center justify-between text-sm text-[hsl(var(--muted-foreground))]">
                                            <span>{tpl.formSchema?.length || 0}개의 문항</span>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEdit(tpl)} className="p-1 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(tpl.id, tpl.title)} className="p-1 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ========== 모니터링 템플릿 탭 ========== */}
                {activeTab === 'monitoring' && (
                    <div className="space-y-3">
                        {monLoading ? (
                            <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">불러오는 중...</div>
                        ) : monTemplates.length === 0 ? (
                            <div className="text-center py-16 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
                                <Activity size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                                <p className="text-[hsl(var(--muted-foreground))]">모니터링 템플릿이 없습니다.</p>
                                <button
                                    onClick={() => setShowMonCreate(true)}
                                    className="mt-3 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold"
                                >
                                    새 템플릿 만들기
                                </button>
                            </div>
                        ) : (
                            monTemplates.map((t) => (
                                <div
                                    key={t.id}
                                    className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 flex items-start justify-between"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${t.templateType === "place" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                                                {t.templateType === "place" ? "🏥 플레이스" : "🔍 통합검색"}
                                            </span>
                                            <h3 className="font-semibold text-[hsl(var(--foreground))]">{t.name}</h3>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500"}`}>
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
                                                    <span key={i} className="px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded-full text-xs font-medium">{k}</span>
                                                ))}
                                            </div>
                                        )}
                                        {t.templateType === "place" && t.targetPlaces && t.targetPlaces.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {t.targetPlaces.map((p: any, i: number) => (
                                                    <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full text-xs font-medium">{p.name || p.platform}</span>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                            범위: {t.monitoringScope?.join(", ")} | 거래처: {monClients.find((c) => c.id === t.clientId)?.name || t.clientId} | 수집: {t.collectCount}건
                                            {t.scheduleEnabled && t.scheduleCron && ` | 자동: ${t.scheduleCron}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4">
                                        {t.scheduleEnabled ? (
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
                                        ) : null}
                                        <button
                                            onClick={() => setEditingMonTemplate(t)}
                                            className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                            title="수정"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={() => deleteMonTemplate(t.id)}
                                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            title="삭제"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* ========== 모니터링 템플릿 생성 모달 ========== */}
            {showMonCreate && (
                <TemplateFormModal
                    mode="create"
                    clients={monClients}
                    onClose={() => setShowMonCreate(false)}
                    onSaved={() => {
                        setShowMonCreate(false);
                        fetchMonitoringData();
                    }}
                />
            )}

            {/* ========== 모니터링 템플릿 수정 모달 ========== */}
            {editingMonTemplate && (
                <TemplateFormModal
                    mode="edit"
                    template={editingMonTemplate}
                    clients={monClients}
                    onClose={() => setEditingMonTemplate(null)}
                    onSaved={() => {
                        setEditingMonTemplate(null);
                        fetchMonitoringData();
                    }}
                />
            )}

            {/* ========== 업무 템플릿 삭제 확인 모달 ========== */}
            {deleteConfirm.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl w-full max-w-md mx-4">
                        {/* 헤더 */}
                        <div className="flex items-center gap-3 p-6 border-b border-[hsl(var(--border))]">
                            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                <Trash2 size={18} className="text-red-500" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-[hsl(var(--foreground))]">템플릿 삭제</h2>
                                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate max-w-[280px]">
                                    {deleteConfirm.templateTitle}
                                </p>
                            </div>
                        </div>

                        {/* 본문 */}
                        <div className="p-6">
                            {deleteConfirm.loading ? (
                                <div className="flex items-center justify-center py-8 text-[hsl(var(--muted-foreground))]">
                                    <RefreshCw size={20} className="animate-spin mr-2" /> 연결된 업무 확인 중...
                                </div>
                            ) : deleteConfirm.linkedTasks.length === 0 ? (
                                <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                                    연결된 업무가 없습니다. 템플릿만 삭제됩니다.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm text-red-500 font-medium mb-3">
                                        ⚠️ 아래 업무 {deleteConfirm.linkedTasks.length}건이 함께 삭제됩니다.
                                    </p>
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                        {deleteConfirm.linkedTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className="flex items-center justify-between px-3 py-2 bg-[hsl(var(--accent))] rounded-lg text-sm"
                                            >
                                                <span className="text-[hsl(var(--foreground))] font-medium truncate flex-1 mr-2">
                                                    {task.title || '제목 없음'}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                                                    task.status === 'completed'
                                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                        : task.status === 'in_progress'
                                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {task.status === 'completed' ? '완료' : task.status === 'in_progress' ? '진행중' : '대기'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 버튼 */}
                        <div className="flex gap-3 px-6 pb-6">
                            <button
                                onClick={() => setDeleteConfirm({ open: false, templateId: null, templateTitle: '', linkedTasks: [], loading: false })}
                                className="flex-1 px-4 py-2.5 border border-[hsl(var(--border))] rounded-lg text-sm font-semibold hover:bg-[hsl(var(--accent))] transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleteConfirm.loading}
                                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                                {deleteConfirm.loading ? '삭제 중...' : '삭제 확인'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplatesPage;

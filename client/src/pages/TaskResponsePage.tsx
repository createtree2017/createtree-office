import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Save, Send, Link as LinkIcon, AlertCircle } from 'lucide-react';

interface Option {
    id: string;
    text: string;
}

interface Question {
    id: string;
    type: string;
    title: string;
    options?: Option[];
    required: boolean;
}

interface Template {
    id: number;
    title: string;
    description: string;
    formSchema: Question[];
}

interface Task {
    id: number;
    title: string;
    description: string;
    status: string;
    templateId: number;
    clientId: number | null;
    driveFolderId: string | null;
}

const TaskResponsePage: React.FC = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});

    const [task, setTask] = useState<Task | null>(null);
    const [template, setTemplate] = useState<Template | null>(null);
    const [responses, setResponses] = useState<Record<string, any>>({});

    // 뒤로가기 처리를 위한 원본 응답 상태 (변경 여부 추적용)
    const [originalResponses, setOriginalResponses] = useState<string>('');

    useEffect(() => {
        const fetchTaskAndDraft = async () => {
            try {
                const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

                // 1. Task 및 템플릿 정보 가져오기
                const taskRes = await fetch(`/api/tasks/${taskId}`, { headers });
                const taskData = await taskRes.json();

                if (!taskData.success) {
                    toast.error(taskData.message || '업무를 찾을 수 없습니다.');
                    navigate('/tasks');
                    return;
                }

                if (!taskData.data.template) {
                    toast.error('이 업무는 템플릿 기반 업무가 아닙니다.');
                    navigate('/tasks');
                    return;
                }

                setTask(taskData.data.task);
                setTemplate(taskData.data.template);

                // 2. 기존 응답 (Draft/Submitted) 가져오기
                const responseRes = await fetch(`/api/task-responses/${taskId}`, { headers });
                const responseData = await responseRes.json();

                if (responseData && responseData.responseData) {
                    setResponses(responseData.responseData);
                    setOriginalResponses(JSON.stringify(responseData.responseData));
                } else {
                    setOriginalResponses('{}');
                }

            } catch (error) {
                toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
            } finally {
                setLoading(false);
            }
        };

        if (taskId) {
            fetchTaskAndDraft();
        }
    }, [taskId, navigate]);

    const handleInputChange = (questionId: string, value: any) => {
        setResponses(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const handleFileUpload = async (questionId: string, file: File) => {
        if (!task?.driveFolderId) {
            toast.error("업로드할 드라이브 폴더가 설정되지 않았습니다.");
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            toast.error("100MB 이하의 파일만 업로드할 수 있습니다.");
            return;
        }

        setUploadingFiles(prev => ({ ...prev, [questionId]: true }));
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folderId', task.driveFolderId);

            const res = await fetch('/api/drive/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await res.json();
            if (data.success && data.file) {
                handleInputChange(questionId, data.file.webViewLink);
                toast.success("파일이 성공적으로 업로드되었습니다.");
            } else {
                toast.error(data.message || "파일 업로드에 실패했습니다.");
            }
        } catch (error) {
            console.error(error);
            toast.error("업로드 중 통신 오류가 발생했습니다.");
        } finally {
            setUploadingFiles(prev => ({ ...prev, [questionId]: false }));
        }
    };

    const handleCheckboxChange = (questionId: string, option: string, checked: boolean) => {
        setResponses(prev => {
            const currentList = prev[questionId] || [];
            if (checked) {
                return { ...prev, [questionId]: [...currentList, option] };
            } else {
                return { ...prev, [questionId]: currentList.filter((item: string) => item !== option) };
            }
        });
    };

    const handleSaveDraft = async () => {
        setIsSaving(true);
        try {
            const payload = {
                status: 'DRAFT',
                responses: responses
            };

            const res = await fetch(`/api/tasks/${taskId}/response`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success('임시저장되었습니다.');
            } else {
                toast.error('임시저장 실패');
            }
        } catch (error) {
            toast.error('통신 오류');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async () => {
        // 필수 값 검증
        if (!template) return;
        const missingRequired = template.formSchema.filter(q => {
            if (!q.required) return false;
            const val = responses[q.id];
            if (val === undefined || val === null || val === '') return true;
            if (Array.isArray(val) && val.length === 0) return true;
            return false;
        });

        if (missingRequired.length > 0) {
            toast.error(`필수 항목을 모두 입력해주세요: ${missingRequired.map(q => q.title).join(', ')}`);
            return;
        }

        if (!window.confirm('제출 후에는 수정할 수 없습니다. 제출하시겠습니까?')) return;

        setIsSaving(true);
        try {
            const payload = {
                status: 'SUBMITTED',
                responses: responses
            };

            const res = await fetch(`/api/tasks/${taskId}/response`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success('최종 제출되었습니다.');
                navigate('/tasks');
            } else {
                toast.error('제출 실패');
            }
        } catch (error) {
            toast.error('통신 오류');
        } finally {
            setIsSaving(false);
        }
    };

    const renderQuestionInput = (q: Question) => {
        const val = responses[q.id] || '';

        switch (q.type) {
            case 'text':
                return (
                    <input
                        type="text"
                        value={val}
                        onChange={(e) => handleInputChange(q.id, e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-600 px-4 py-3 text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none transition-colors"
                        placeholder="짧은 답변 입력"
                    />
                );
            case 'textarea':
                return (
                    <textarea
                        value={val}
                        onChange={(e) => handleInputChange(q.id, e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none min-h-[120px] transition-colors resize-y"
                        placeholder="상세한 답변 입력"
                    />
                );
            case 'radio':
                return (
                    <div className="space-y-3">
                        {q.options?.map((opt, idx) => (
                            <label key={opt.id || idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                <input
                                    type="radio"
                                    name={q.id}
                                    value={opt.text}
                                    checked={val === opt.text}
                                    onChange={() => handleInputChange(q.id, opt.text)}
                                    className="w-5 h-5 text-emerald-500 border-slate-300 focus:ring-emerald-500"
                                />
                                <span className="text-slate-700 dark:text-slate-300 font-medium">{opt.text}</span>
                            </label>
                        ))}
                    </div>
                );
            case 'checkbox':
                const selectedList = Array.isArray(val) ? val : [];
                return (
                    <div className="space-y-3">
                        {q.options?.map((opt, idx) => (
                            <label key={opt.id || idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={selectedList.includes(opt.text)}
                                    onChange={(e) => handleCheckboxChange(q.id, opt.text, e.target.checked)}
                                    className="w-5 h-5 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500"
                                />
                                <span className="text-slate-700 dark:text-slate-300 font-medium">{opt.text}</span>
                            </label>
                        ))}
                    </div>
                );
            case 'select':
                return (
                    <select
                        value={val}
                        onChange={(e) => handleInputChange(q.id, e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    >
                        <option value="" disabled>항목을 선택하세요</option>
                        {q.options?.map((opt, idx) => (
                            <option key={opt.id || idx} value={opt.text}>{opt.text}</option>
                        ))}
                    </select>
                );
            case 'file':
                return (
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden">
                        {uploadingFiles[q.id] && (
                            <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 transition-all">
                                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                                <span className="text-blue-700 dark:text-blue-400 font-bold">드라이브로 업로드 중...</span>
                            </div>
                        )}
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform">
                                <LinkIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h4 className="font-bold text-slate-700 dark:text-slate-300">구글 드라이브 파일 제출</h4>
                            <p className="text-sm text-slate-500 max-w-sm mb-4">
                                {val ? "파일이 드라이브에 성공적으로 업로드되었습니다." : "파일을 선택하면 할당된 폴더로 자동 업로드됩니다."}
                            </p>

                            {val ? (
                                <div className="flex w-full max-w-md gap-2 items-center">
                                    <a
                                        href={val}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 truncate bg-white dark:bg-slate-900 border-2 border-emerald-300 dark:border-emerald-700 rounded-lg px-4 py-2.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm font-semibold text-center transition-colors"
                                        title="첨부된 드라이브 파일 열기"
                                    >
                                        첨부된 파일 확인하기 (새 창)
                                    </a>
                                    <button
                                        onClick={() => handleInputChange(q.id, '')}
                                        className="px-4 py-2 bg-rose-100 text-rose-600 font-bold rounded-lg hover:bg-rose-200 transition-colors whitespace-nowrap shadow-sm"
                                        title="파일 삭제"
                                    >
                                        삭제
                                    </button>
                                </div>
                            ) : (
                                <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 mt-2">
                                    내 PC에서 파일 선택하기
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                handleFileUpload(q.id, file);
                                            }
                                            e.target.value = ''; // 재선택을 위해 초기화
                                        }}
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                );
            default:
                return <div className="p-4 bg-red-50 text-red-500 border border-red-200 rounded-lg">지원하지 않는 질문 타입입니다: {q.type}</div>;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!task || !template) return null;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 pt-24 pb-32">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* 상단 네비게이션 & 헤더 */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => navigate('/tasks')}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors font-bold"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        목록으로 돌아가기
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveDraft}
                            disabled={isSaving || isSubmitting}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-all"
                        >
                            <Save className="w-4 h-4" />
                            {isSaving && !isSubmitting ? '저장 중...' : '임시저장'}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSaving || isSubmitting}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                        >
                            <Send className="w-4 h-4 ml-1" />
                            {isSaving || isSubmitting ? '처리 중...' : '최종 제출'}
                        </button>
                    </div>
                </div>

                {/* 폼 안내 섹션 */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-12 shadow-sm border border-slate-200 dark:border-slate-800 border-t-[10px] border-t-emerald-500">
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
                        {template.title}
                    </h1>
                    <div className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl mb-6 border border-emerald-100 dark:border-emerald-900/50">
                        <AlertCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed">
                                {template.description || "이 양식에 맞추어 업무 내용을 작성해 주세요."}
                            </p>
                            {task.driveFolderId && (
                                <div className="mt-3 inline-flex items-center gap-2 text-[13px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800/50">
                                    <LinkIcon className="w-4 h-4" />
                                    파일 첨부용 할당 드라이브 폴더가 존재합니다 (추후 연동)
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-sm font-semibold text-rose-500 dark:text-rose-400">
                        * 표시는 필수 항목입니다.
                    </div>
                </div>

                {/* 폼 문항 섹션 */}
                <div className="space-y-6">
                    {template.formSchema.map((q, index) => (
                        <div key={q.id} className="bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-10 shadow-sm border border-slate-200 dark:border-slate-800 transition-all focus-within:ring-2 focus-within:ring-emerald-500/50">
                            <label className="block text-lg font-bold text-slate-900 dark:text-white mb-6">
                                {index + 1}. {q.title}
                                {q.required && <span className="text-rose-500 ml-1.5">*</span>}
                            </label>

                            {renderQuestionInput(q)}
                        </div>
                    ))}
                </div>

                {/* 하단 플로팅 액션바 (선택적) */}
                <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-4 transform translate-y-0 transition-transform hidden md:flex justify-center gap-4 z-40">
                    <button
                        onClick={handleSaveDraft}
                        disabled={isSaving || isSubmitting}
                        className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-all min-w-[160px] justify-center"
                    >
                        <Save className="w-5 h-5" />
                        임시저장하기
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving || isSubmitting}
                        className="flex items-center gap-2 px-10 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all min-w-[200px] justify-center"
                    >
                        <Send className="w-5 h-5 ml-1" />
                        최종 제출하기
                    </button>
                </div>

            </div>
        </div>
    );
};

export default TaskResponsePage;

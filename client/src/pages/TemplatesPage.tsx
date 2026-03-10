import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Save, MoveUp, MoveDown, FileText, CheckSquare, Edit } from 'lucide-react';

// 질문 타입 정의
type QuestionType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'file';

interface Option {
    id: string;
    text: string;
}

interface Question {
    id: string;
    type: QuestionType;
    title: string;
    options?: Option[]; // 객관식, 체크박스, 드롭다운일 경우
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

const TemplatesPage: React.FC = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(false);

    // 에디터 상태
    const [isEditing, setIsEditing] = useState(false);
    const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);

    useEffect(() => {
        fetchTemplates();
    }, []);

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

    const handleDelete = async (id: number) => {
        if (!window.confirm('정말 이 템플릿을 삭제하시겠습니까? (연결된 업무가 있으면 삭제할 수 없습니다.)')) return;
        try {
            await fetch(`/api/templates/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            toast.success('템플릿이 삭제되었습니다.');
            fetchTemplates();
        } catch (error) {
            toast.error('템플릿 삭제 실패');
        }
    };

    const handleAddQuestion = (type: QuestionType) => {
        const newQ: Question = {
            id: Date.now().toString(),
            type,
            title: '',
            required: false,
        };
        if (type === 'radio' || type === 'checkbox' || type === 'select') {
            newQ.options = [{ id: Date.now().toString() + '-opt', text: '옵션 1' }];
        }
        setQuestions([...questions, newQ]);
    };

    const handleQuestionChange = (id: string, field: keyof Question, value: any) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
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
            if (q.id === questionId && q.options) {
                return {
                    ...q,
                    options: [...q.options, { id: Date.now().toString(), text: `옵션 ${q.options.length + 1}` }]
                };
            }
            return q;
        }));
    };

    const handleOptionChange = (questionId: string, optionId: string, text: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId && q.options) {
                return {
                    ...q,
                    options: q.options.map(opt => opt.id === optionId ? { ...opt, text } : opt)
                };
            }
            return q;
        }));
    };

    const handleRemoveOption = (questionId: string, optionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId && q.options) {
                return {
                    ...q,
                    options: q.options.filter(opt => opt.id !== optionId)
                };
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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
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

    // 관리자 또는 매니저만 접근 가능 표시
    if (user?.role === 'USER') {
        return <div className="p-8 text-center text-red-500">접근 권한이 없습니다.</div>;
    }

    if (isEditing) {
        return (
            <div className="max-w-4xl mx-auto p-6 pt-24 space-y-6 pb-32">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">{currentTemplateId ? '템플릿 수정' : '새 업무 템플릿 만들기'}</h1>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2">
                            <Save className="w-4 h-4" /> 저장하기
                        </button>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">템플릿 제목 (예: 서포터즈 모집 보고서)</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full text-xl font-bold p-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none" placeholder="제목 없는 템플릿" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">템플릿 설명 (선택)</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none resize-none" placeholder="이 템플릿에 대한 설명을 적어주세요." rows={2} />
                    </div>
                </div>

                {/* 질문 리스트 */}
                <div className="space-y-4">
                    {questions.map((q, index) => (
                        <div key={q.id} className="bg-white p-5 rounded-lg shadow-sm border flex gap-4">
                            <div className="flex flex-col gap-2 items-center text-gray-400 mt-2">
                                <button onClick={() => handleMoveQuestion(index, 'up')} className="hover:text-blue-600 disabled:opacity-30" disabled={index === 0}><MoveUp className="w-4 h-4" /></button>
                                <span className="text-xs font-mono">{index + 1}</span>
                                <button onClick={() => handleMoveQuestion(index, 'down')} className="hover:text-blue-600 disabled:opacity-30" disabled={index === questions.length - 1}><MoveDown className="w-4 h-4" /></button>
                            </div>

                            <div className="flex-1 space-y-4">
                                <div className="flex gap-4">
                                    <input type="text" value={q.title} onChange={e => handleQuestionChange(q.id, 'title', e.target.value)} className="flex-1 p-2 bg-gray-50 border-b border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none" placeholder="질문 내용을 입력하세요" />
                                    <select value={q.type} onChange={e => handleQuestionChange(q.id, 'type', e.target.value)} className="p-2 border rounded bg-white">
                                        <option value="text">단답형</option>
                                        <option value="textarea">장문형</option>
                                        <option value="radio">객관식 (단일)</option>
                                        <option value="checkbox">체크박스 (다중)</option>
                                        <option value="select">드롭다운</option>
                                        <option value="file">파일 업로드 (드라이브)</option>
                                    </select>
                                </div>

                                {/* 문항 옵션 렌더링 (객관식 등) */}
                                {(q.type === 'radio' || q.type === 'checkbox' || q.type === 'select') && (
                                    <div className="pl-4 space-y-2">
                                        {q.options?.map((opt, optIdx) => (
                                            <div key={opt.id} className="flex items-center gap-2">
                                                <div className="w-4 h-4 border rounded-full border-gray-300 flex-shrink-0" />
                                                <input type="text" value={opt.text} onChange={e => handleOptionChange(q.id, opt.id, e.target.value)} className="flex-1 p-1 border-b focus:border-blue-500 focus:outline-none" />
                                                <button onClick={() => handleRemoveOption(q.id, opt.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        <button onClick={() => handleAddOption(q.id)} className="text-sm text-blue-600 hover:underline mt-2">옵션 추가</button>
                                    </div>
                                )}

                                <div className="flex justify-end items-center gap-4 pt-4 border-t mt-4">
                                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input type="checkbox" checked={q.required} onChange={e => handleQuestionChange(q.id, 'required', e.target.checked)} className="rounded text-blue-600" />
                                        필수 문항
                                    </label>
                                    <button onClick={() => handleRemoveQuestion(q.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 질문 추가 위젯 */}
                <div className="bg-white border rounded-lg p-2 shadow-sm flex justify-center gap-4 sticky bottom-4 mx-auto max-w-max">
                    <button onClick={() => handleAddQuestion('text')} className="flex flex-col items-center p-2 hover:bg-gray-100 rounded text-gray-700" title="텍스트 질문 추가">
                        <FileText className="w-5 h-5 mb-1" />
                        <span className="text-xs">단답형</span>
                    </button>
                    <button onClick={() => handleAddQuestion('radio')} className="flex flex-col items-center p-2 hover:bg-gray-100 rounded text-gray-700" title="객관식 질문 추가">
                        <CheckSquare className="w-5 h-5 mb-1" />
                        <span className="text-xs">객관식</span>
                    </button>
                    <button onClick={() => handleAddQuestion('file')} className="flex flex-col items-center p-2 hover:bg-gray-100 rounded text-gray-700" title="파일 업로드 추가">
                        <Plus className="w-5 h-5 mb-1" />
                        <span className="text-xs">파일첨부</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 pt-24 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">업무 템플릿 관리</h1>
                    <p className="text-gray-500 mt-1">창조트리 맞춤형 업무 폼 양식을 관리합니다.</p>
                </div>
                <button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow flex items-center gap-2">
                    <Plus className="w-4 h-4" /> 템플릿 쓰기
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">불러오는 중...</div>
            ) : templates.length === 0 ? (
                <div className="text-center py-20 bg-white border border-dashed rounded-xl">
                    <h3 className="text-lg font-medium text-gray-900">템플릿이 없습니다.</h3>
                    <p className="text-gray-500 mt-2">첫 번째 업무 양식을 만들어보세요!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map(tpl => (
                        <div key={tpl.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-lg transition flex flex-col group">
                            <div className="p-5 flex-1 cursor-pointer" onClick={() => handleEdit(tpl)}>
                                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition">{tpl.title}</h3>
                                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{tpl.description || '설명 없음'}</p>
                            </div>
                            <div className="bg-gray-50 p-4 border-t flex items-center justify-between text-sm text-gray-500">
                                <span>{tpl.formSchema?.length || 0}개의 문항</span>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEdit(tpl)} className="p-1 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(tpl.id)} className="p-1 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TemplatesPage;

import React, { useState, useEffect } from 'react';
import { useModal } from '../contexts/ModalContext';
import toast from 'react-hot-toast';

interface User {
    id: number;
    name: string;
    role: string;
}

interface Client {
    id: number;
    name: string;
}

interface Template {
    id: number;
    title: string;
}

interface CreateTaskModalProps {
    onSuccess: () => void;
    initialData?: any;
}

const CreateTaskModal = ({ onSuccess, initialData }: CreateTaskModalProps) => {
    const { closeModal } = useModal();
    const [users, setUsers] = useState<User[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);

    // 템플릿 사용 여부 플래그
    const [useTemplate, setUseTemplate] = useState(false);
    const [templateId, setTemplateId] = useState<number | ''>('');
    const [clientId, setClientId] = useState<number | ''>('');

    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [status, setStatus] = useState(initialData?.status || 'PENDING');
    const [dueDate, setDueDate] = useState(initialData?.dueDate ? initialData.dueDate.slice(0, 10) : '');
    const [assigneeId, setAssigneeId] = useState<number | string>(initialData?.assigneeId || '');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
                // 직원 목록
                const userRes = await fetch('/api/auth/users', { headers });
                const userData = await userRes.json();
                if (userData.success) setUsers(userData.data);

                // 거래처(병원) 목록
                const clientRes = await fetch('/api/clients', { headers });
                const clientData = await clientRes.json();
                if (clientData.success) setClients(clientData.data);

                // 템플릿 목록
                const tplRes = await fetch('/api/templates', { headers });
                if (tplRes.ok) {
                    const tplData = await tplRes.json();
                    setTemplates(tplData);
                }
            } catch (err) {
                toast.error('초기 데이터를 불러오지 못했습니다.');
            }
        };
        fetchData();
    }, []);

    // 템플릿 선택 시 제목 자동 입력
    const handleTemplateChange = (id: string) => {
        const tid = Number(id);
        setTemplateId(tid);
        const tpl = templates.find(t => t.id === tid);
        if (tpl && !title) {
            setTitle(tpl.title);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigneeId) return toast.error('담당자를 지정해주세요.');
        if (useTemplate && !templateId) return toast.error('템플릿을 선택해주세요.');
        if (useTemplate && !clientId) return toast.error('템플릿 사용 시 거래처를 필수로 지정해야 합니다. (드라이브 폴더 연동)');

        setLoading(true);

        try {
            const url = initialData ? `/api/tasks/${initialData.id}` : '/api/tasks';
            const method = initialData ? 'PATCH' : 'POST';

            // 템플릿 API는 title, templateId, clientId, assigneeId, dueDate 를 받음
            const bodyData = useTemplate ? {
                title, templateId, clientId, assigneeId: Number(assigneeId), dueDate: dueDate || null
            } : {
                title, description, status, dueDate: dueDate || null, assigneeId: Number(assigneeId)
            };

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(bodyData),
            });

            const result = await response.json();
            if (response.ok && (result.success || !result.message)) { // task-instances 는 success 가 없을수도 있어서 ok로 체크 추가
                toast.success(initialData ? '업무가 수정되었습니다.' :
                    useTemplate ? '템플릿 업무 및 드라이브 폴더가 정상 생성되었습니다.' : '업무가 할당되었습니다.');
                onSuccess();
                closeModal();
            } else {
                toast.error(result.message || '오류가 발생했습니다.');
            }
        } catch (err) {
            toast.error('서버 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
                {initialData ? '업무 수정' : '새 업무 할당'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">

                {/* 템플릿 사용 토글 */}
                {!initialData && (
                    <div className="mb-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 bg-slate-800/50 block w-full p-3 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-700 transition">
                            <input
                                type="checkbox"
                                checked={useTemplate}
                                onChange={e => setUseTemplate(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                            />
                            정형화된 업무 템플릿 사용하기 (구글 드라이브 폴더 자동 생성)
                        </label>
                    </div>
                )}

                {useTemplate && (
                    <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-700/50 mb-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">템플릿 선택</label>
                            <select
                                value={templateId}
                                onChange={(e) => handleTemplateChange(e.target.value)}
                                className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                required={useTemplate}
                            >
                                <option value="">템플릿 선택</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">거래처(폴더 생성 기준)</label>
                            <select
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                required={useTemplate}
                            >
                                <option value="">거래처 선택</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">업무 제목 {useTemplate && '(생성될 폴더명이기도 합니다)'}</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        required
                        placeholder={useTemplate ? "예: 03월 서포터즈 성과 보고" : "업무 명칭을 입력하세요"}
                    />
                </div>
                {!useTemplate && (
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">상세 설명</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                            placeholder="업무에 대한 상세 내용을 입력하세요"
                        />
                    </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">담당자 지정</label>
                        <select
                            value={assigneeId}
                            onChange={(e) => setAssigneeId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                            required
                        >
                            <option value="">담당자 선택</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">마감 기한</label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">현재 상태</label>
                    <div className="grid grid-cols-4 gap-2">
                        {['PENDING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'].map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatus(s)}
                                className={`py-2 rounded-lg text-xs font-bold border transition-all ${status === s
                                    ? 'bg-emerald-500 border-emerald-400 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                                    }`}
                            >
                                {s === 'PENDING' ? '대기' : s === 'IN_PROGRESS' ? '진행' : s === 'ON_HOLD' ? '보류' : '완료'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-3 pt-6">
                    <button
                        type="button"
                        onClick={closeModal}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                    >
                        {loading ? '처리 중...' : initialData ? '수정하기' : '업무 할당'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateTaskModal;

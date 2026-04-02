import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModal } from '../contexts/ModalContext';
import { useClients } from '../hooks/useClients';
import { useTemplates } from '../hooks/useTemplates';
import { useUsers } from '../hooks/useUsers';
import toast from 'react-hot-toast';

interface CreateTaskModalProps {
    onSuccess: () => void;
    initialData?: any;
}

const CreateTaskModal = ({ onSuccess, initialData }: CreateTaskModalProps) => {
    const { closeModal } = useModal();
    const queryClient = useQueryClient();
    const { data: users = [] } = useUsers();
    const { data: clients = [] } = useClients();
    const { data: templates = [] } = useTemplates();

    const [templateId, setTemplateId] = useState<number | ''>(initialData?.templateId || '');
    const [clientId, setClientId] = useState<number | ''>(initialData?.clientId || '');

    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [status, setStatus] = useState(initialData?.status || 'PENDING');
    const [dueDate, setDueDate] = useState(initialData?.dueDate ? initialData.dueDate.slice(0, 10) : '');
    const [assigneeId, setAssigneeId] = useState<number | string>(initialData?.assigneeId || '');
    const [loading, setLoading] = useState(false);

    // 템플릿 선택 시 제목 자동 입력
    const handleTemplateChange = (id: string) => {
        const tid = Number(id);
        setTemplateId(tid || '');
        const tpl = templates.find(t => t.id === tid);
        if (tpl && !title) {
            setTitle(tpl.title);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigneeId) return toast.error('담당자를 지정해주세요.');
        if (!title) return toast.error('업무 제목을 입력해주세요.');

        setLoading(true);

        try {
            const url = initialData ? `/api/tasks/${initialData.id}` : '/api/tasks';
            const method = initialData ? 'PATCH' : 'POST';

            const bodyData = {
                title,
                description,
                status,
                dueDate: dueDate || null,
                assigneeId: Number(assigneeId),
                templateId: templateId || null,
                clientId: clientId || null,
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
            if (response.ok && (result.success || !result.message)) {
                toast.success(initialData ? '업무가 수정되었습니다.' :
                    templateId ? '템플릿 업무 및 드라이브 폴더가 정상 생성되었습니다.' : '업무가 할당되었습니다.');
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
                
                {/* 거래처 & 템플릿 (항상 노출, 선택사항) */}
                <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-700/50 mb-2">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">거래처(병원) 지정</label>
                        <select
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
                            className="w-full bg-slate-800 border-2 border-slate-700 hover:border-slate-500 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        >
                            <option value="">내부업무 (창조트리)</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">업무 템플릿 (선택)</label>
                        <select
                            value={templateId}
                            onChange={(e) => handleTemplateChange(e.target.value)}
                            className="w-full bg-slate-800 border-2 border-slate-700 hover:border-slate-500 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        >
                            <option value="">일반 업무 (템플릿 없음)</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.title}</option>
                            ))}
                        </select>
                        {templateId && (
                            <p className="text-[11px] text-emerald-400 font-medium mt-1.5 ml-1">
                                * 선택 시 자동으로 구글 드라이브 폴더가 생성됩니다.
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">업무 제목</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold"
                        required
                        placeholder="업무 명칭을 입력하세요"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">요약 설명 (선택)</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                        placeholder="업무에 대한 요약 내용을 입력하세요"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">담당자 지정</label>
                        <select
                            value={assigneeId}
                            onChange={(e) => setAssigneeId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1 mt-2">현재 상태</label>
                    <div className="grid grid-cols-4 gap-2">
                        {['PENDING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'].map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatus(s)}
                                className={`py-2 rounded-lg text-sm font-bold border transition-all ${status === s
                                    ? 'bg-blue-600 border-blue-500 text-white shadow-md'
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
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                    >
                        {loading ? '처리 중...' : initialData ? '수정 완료' : '업무 할당 완료'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateTaskModal;


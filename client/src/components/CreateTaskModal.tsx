import React, { useState, useEffect } from 'react';
import { useModal } from '../contexts/ModalContext';
import toast from 'react-hot-toast';

interface User {
    id: number;
    name: string;
    role: string;
}

interface CreateTaskModalProps {
    onSuccess: () => void;
    initialData?: any;
}

const CreateTaskModal = ({ onSuccess, initialData }: CreateTaskModalProps) => {
    const { closeModal } = useModal();
    const [users, setUsers] = useState<User[]>([]);
    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [status, setStatus] = useState(initialData?.status || 'PENDING');
    const [dueDate, setDueDate] = useState(initialData?.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : '');
    const [assigneeId, setAssigneeId] = useState<number | string>(initialData?.assigneeId || '');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await fetch('/api/auth/users', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const result = await response.json();
                if (result.success) {
                    setUsers(result.data);
                }
            } catch (err) {
                toast.error('직원 목록을 불러오지 못했습니다.');
            }
        };
        fetchUsers();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigneeId) {
            toast.error('담당자를 지정해주세요.');
            return;
        }
        setLoading(true);

        try {
            const url = initialData ? `/api/tasks/${initialData.id}` : '/api/tasks';
            const method = initialData ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    status,
                    dueDate: dueDate || null,
                    assigneeId: Number(assigneeId)
                }),
            });

            const result = await response.json();
            if (result.success) {
                toast.success(initialData ? '업무가 수정되었습니다.' : '업무가 할당되었습니다.');
                onSuccess();
                closeModal();
            } else {
                toast.error(result.message);
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
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">업무 제목</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        required
                        placeholder="업무 명칭을 입력하세요"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">상세 설명</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                        placeholder="업무에 대한 상세 내용을 입력하세요"
                    />
                </div>
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

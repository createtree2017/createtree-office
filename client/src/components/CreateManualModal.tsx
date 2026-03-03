import React, { useState } from 'react';
import { useModal } from '../contexts/ModalContext';
import toast from 'react-hot-toast';

interface CreateManualModalProps {
    onSuccess: () => void;
}

const CreateManualModal = ({ onSuccess }: CreateManualModalProps) => {
    const { closeModal } = useModal();
    const [title, setTitle] = useState('');
    const [minRoleToEdit, setMinRoleToEdit] = useState('MANAGER');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('/api/manuals', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ title, content: '<p>내용을 입력하세요...</p>', minRoleToEdit }),
            });

            const result = await response.json();
            if (result.success) {
                toast.success('매뉴얼이 생성되었습니다.');
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
            <h2 className="text-2xl font-bold text-white mb-6">새 매뉴얼 생성</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">제목</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        required
                        placeholder="예: 신입 사원 온보딩 가이드"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">편집 가능 최소 등급</label>
                    <select
                        value={minRoleToEdit}
                        onChange={(e) => setMinRoleToEdit(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                        <option value="USER">직원 (누구나 수정 가능)</option>
                        <option value="MANAGER">관리자 이상</option>
                        <option value="ADMIN">최고관리자만</option>
                    </select>
                </div>
                <div className="flex gap-3 pt-4">
                    <button
                        type="button"
                        onClick={closeModal}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? '생성 중...' : '생성하기'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateManualModal;

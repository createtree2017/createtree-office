import React, { useState } from 'react';
import { useModal } from '../contexts/ModalContext';
import toast from 'react-hot-toast';
import { FileText, Folder, Smile } from 'lucide-react';

interface CreateManualModalProps {
    onSuccess: () => void;
    initialParentId?: number | null;
}

const CreateManualModal = ({ onSuccess, initialParentId = null }: CreateManualModalProps) => {
    const { closeModal } = useModal();
    const [title, setTitle] = useState('');
    const [minRoleToEdit, setMinRoleToEdit] = useState('MANAGER');
    const [type, setType] = useState<'PAGE' | 'FOLDER'>('PAGE');
    const [icon, setIcon] = useState('📝');
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
                body: JSON.stringify({
                    title,
                    content: type === 'FOLDER' ? '' : '<p>내용을 입력하세요...</p>',
                    minRoleToEdit,
                    parentId: initialParentId,
                    type,
                    icon
                }),
            });

            const result = await response.json();
            if (result.success) {
                toast.success(`${type === 'FOLDER' ? '폴더' : '매뉴얼'}가 생성되었습니다.`);
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
        <div className="p-8 bg-white rounded-3xl">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-8 tracking-tight">새 항목 생성</h2>
            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => { setType('PAGE'); setIcon('📝'); }}
                        className={`flex-1 p-5 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all duration-300 ${type === 'PAGE' ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-md shadow-blue-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                    >
                        <FileText size={28} />
                        <span className="font-bold text-sm">페이지</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setType('FOLDER'); setIcon('📁'); }}
                        className={`flex-1 p-5 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all duration-300 ${type === 'FOLDER' ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-md shadow-blue-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                    >
                        <Folder size={28} />
                        <span className="font-bold text-sm">폴더</span>
                    </button>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-500 ml-1 uppercase tracking-wider">제목 및 아이콘</label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={icon}
                            onChange={(e) => setIcon(e.target.value)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded-2xl px-2 py-4 text-center text-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            placeholder="📝"
                        />
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            required
                            placeholder={type === 'PAGE' ? "예: 신입 사원 온보딩" : "예: 인사팀 매뉴얼"}
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-500 ml-1 uppercase tracking-wider">편집 가능 최소 등급</label>
                    <select
                        value={minRoleToEdit}
                        onChange={(e) => setMinRoleToEdit(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 appearance-none font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        <option value="USER">직원 (누구나 수정 가능)</option>
                        <option value="MANAGER">관리자 이상</option>
                        <option value="ADMIN">최고관리자만</option>
                    </select>
                </div>

                <div className="flex gap-4 pt-6">
                    <button
                        type="button"
                        onClick={closeModal}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-4 rounded-2xl transition-all cursor-pointer"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-slate-200 cursor-pointer"
                    >
                        {loading ? '생성 중...' : '생성하기'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateManualModal;

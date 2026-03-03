import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ManualEditor from '../components/ManualEditor';
import CreateManualModal from '../components/CreateManualModal';
import { useModal } from '../contexts/ModalContext';
import toast from 'react-hot-toast';

interface Manual {
    id: number;
    title: string;
    content: string;
    minRoleToEdit: string;
}

const ManualsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [manuals, setManuals] = useState<Manual[]>([]);
    const [currentManual, setCurrentManual] = useState<Manual | null>(null);
    const [loading, setLoading] = useState(true);

    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const roles = ["USER", "MANAGER", "ADMIN"];

    const fetchManuals = async () => {
        try {
            const response = await fetch('/api/manuals', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                setManuals(result.data);
            }
        } catch (err) {
            toast.error('목록을 불러오지 못했습니다.');
        }
    };

    const fetchDetail = async (manualId: string) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/manuals/${manualId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                setCurrentManual(result.data);
            }
        } catch (err) {
            toast.error('상세 내용을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchManuals();
    }, []);

    useEffect(() => {
        if (id) {
            fetchDetail(id);
        } else {
            setLoading(false);
            setCurrentManual(null);
        }
    }, [id]);

    const handleSave = async (content: string) => {
        if (!id) return;
        const response = await fetch(`/api/manuals/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ content }),
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
    };

    const canEdit = currentManual && user && roles.indexOf(user.role) >= roles.indexOf(currentManual.minRoleToEdit);

    const { openModal } = useModal();

    const handleCreateClick = () => {
        openModal(<CreateManualModal onSuccess={fetchManuals} />);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex">
            {/* Sidebar */}
            <div className="w-64 border-r border-slate-800 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-blue-400">Manuals</h2>
                    {user && (user.role === 'ADMIN' || user.role === 'MANAGER') && (
                        <button
                            onClick={handleCreateClick}
                            className="p-1 hover:bg-slate-800 rounded-lg text-blue-400 transition-colors cursor-pointer"
                            title="새 매뉴얼 만들기"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                </div>
                <div className="space-y-2 overflow-y-auto flex-1">
                    {manuals.map(m => (
                        <div
                            key={m.id}
                            onClick={() => navigate(`/manuals/${m.id}`)}
                            className={`p-3 rounded-lg cursor-pointer transition-colors ${parseInt(id || '0') === m.id ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' : 'hover:bg-slate-900 text-slate-400'
                                }`}
                        >
                            {m.title}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-12 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-slate-500 animate-pulse">정보를 불러오는 중...</div>
                ) : currentManual ? (
                    <div className="max-w-4xl mx-auto">
                        <h1 className="text-4xl font-bold mb-8 text-white">{currentManual.title}</h1>
                        <div className="bg-slate-900/30 rounded-2xl border border-slate-800 p-6 shadow-xl">
                            <ManualEditor
                                initialContent={currentManual.content}
                                onSave={handleSave}
                                editable={!!canEdit}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <p className="text-xl">매뉴얼을 선택하거나 새로 생성하세요.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManualsPage;

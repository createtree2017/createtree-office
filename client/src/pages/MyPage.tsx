import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Shield, Calendar, LogOut, Key, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const MyPage = () => {
    const navigate = useNavigate();
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        toast.success('로그아웃 되었습니다.');
        navigate('/login');
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPw !== confirmPw) {
            toast.error('새 비밀번호가 일치하지 않습니다.');
            return;
        }
        if (newPw.length < 6) {
            toast.error('비밀번호는 6자 이상이어야 합니다.');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('비밀번호가 변경되었습니다.');
                setCurrentPw('');
                setNewPw('');
                setConfirmPw('');
            } else {
                toast.error(result.message || '비밀번호 변경에 실패했습니다.');
            }
        } catch {
            toast.error('오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'ADMIN': return { label: '관리자', className: 'bg-amber-100 text-amber-700 border border-amber-200' };
            case 'MANAGER': return { label: '매니저', className: 'bg-blue-100 text-blue-700 border border-blue-200' };
            default: return { label: '일반 사용자', className: 'bg-slate-100 text-slate-600 border border-slate-200' };
        }
    };

    const badge = user ? getRoleBadge(user.role) : null;

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] pt-14">
            <div className="max-w-2xl mx-auto px-6 py-10">
                {/* 헤더 */}
                <div className="flex items-center gap-3 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-900"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-extrabold text-slate-900">마이페이지</h1>
                </div>

                {/* 프로필 카드 */}
                <div className="bento-card p-8 mb-6">
                    <div className="flex items-center gap-6 mb-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-200">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">{user?.name}</h2>
                            <p className="text-slate-500 text-sm mb-3">{user?.email}</p>
                            {badge && (
                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge.className}`}>
                                    {badge.label}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                                <User size={16} className="text-blue-600" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">이름</p>
                                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                                <Mail size={16} className="text-purple-600" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">이메일</p>
                                <p className="text-sm font-semibold text-slate-800">{user?.email}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                                <Shield size={16} className="text-amber-600" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">권한 등급</p>
                                <p className="text-sm font-semibold text-slate-800">{badge?.label}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 비밀번호 변경 */}
                <div className="bento-card p-8 mb-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                            <Key size={16} className="text-slate-500" />
                        </div>
                        <h3 className="font-bold text-slate-900">비밀번호 변경</h3>
                    </div>

                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">현재 비밀번호</label>
                            <input
                                type="password"
                                value={currentPw}
                                onChange={e => setCurrentPw(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="현재 비밀번호 입력"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">새 비밀번호</label>
                            <input
                                type="password"
                                value={newPw}
                                onChange={e => setNewPw(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="새 비밀번호 (6자 이상)"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">새 비밀번호 확인</label>
                            <input
                                type="password"
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="새 비밀번호 재입력"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg disabled:opacity-50"
                        >
                            {loading ? '변경 중...' : '비밀번호 변경'}
                        </button>
                    </form>
                </div>

                {/* 로그아웃 */}
                <div className="bento-card p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-slate-900 mb-0.5">로그아웃</p>
                            <p className="text-sm text-slate-400">현재 세션을 종료합니다</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl transition-all border border-rose-100"
                        >
                            <LogOut size={16} />
                            로그아웃
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MyPage;

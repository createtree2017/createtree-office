import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Shield, LogOut, Key, ArrowLeft } from 'lucide-react';
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
        if (newPw !== confirmPw) { toast.error('새 비밀번호가 일치하지 않습니다.'); return; }
        if (newPw.length < 6) { toast.error('비밀번호는 6자 이상이어야 합니다.'); return; }
        setLoading(true);
        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('비밀번호가 변경되었습니다.');
                setCurrentPw(''); setNewPw(''); setConfirmPw('');
            } else {
                toast.error(result.message || '비밀번호 변경에 실패했습니다.');
            }
        } catch { toast.error('오류가 발생했습니다.'); }
        finally { setLoading(false); }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'ADMIN': return { label: '관리자', className: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40' };
            case 'MANAGER': return { label: '매니저', className: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40' };
            default: return { label: '일반 사용자', className: 'bg-slate-100 dark:bg-slate-600/40 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-500/40' };
        }
    };

    const badge = user ? getRoleBadge(user.role) : null;
    const inputClass = "w-full px-4 py-3 bg-slate-50 dark:bg-[hsl(var(--secondary))] border border-slate-200 dark:border-[hsl(var(--border))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] pt-14">
            <div className="max-w-2xl mx-auto px-6 py-10">
                {/* 헤더 */}
                <div className="flex items-center gap-3 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">마이페이지</h1>
                </div>

                {/* 프로필 카드 */}
                <div className="bento-card p-8 mb-6">
                    <div className="flex items-center gap-6 mb-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-1">{user?.name}</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">{user?.email}</p>
                            {badge && (
                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge.className}`}>
                                    {badge.label}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {[
                            { icon: User, iconClass: 'bg-blue-100 dark:bg-blue-500/25 text-blue-600 dark:text-blue-300', label: '이름', value: user?.name },
                            { icon: Mail, iconClass: 'bg-purple-100 dark:bg-purple-500/25 text-purple-600 dark:text-purple-300', label: '이메일', value: user?.email },
                            { icon: Shield, iconClass: 'bg-amber-100 dark:bg-amber-500/25 text-amber-600 dark:text-amber-300', label: '권한 등급', value: badge?.label },
                        ].map(({ icon: Icon, iconClass, label, value }) => (
                            <div key={label} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-[hsl(var(--secondary))] rounded-xl border border-[hsl(var(--border))]">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>
                                    <Icon size={16} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 비밀번호 변경 */}
                <div className="bento-card p-8 mb-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                            <Key size={16} className="text-slate-500 dark:text-slate-400" />
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100">비밀번호 변경</h3>
                    </div>

                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">현재 비밀번호</label>
                            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} placeholder="현재 비밀번호 입력" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">새 비밀번호</label>
                            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputClass} placeholder="새 비밀번호 (6자 이상)" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">새 비밀번호 확인</label>
                            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputClass} placeholder="새 비밀번호 재입력" required />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-slate-900 dark:bg-blue-600 hover:bg-slate-700 dark:hover:bg-blue-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg disabled:opacity-50"
                        >
                            {loading ? '변경 중...' : '비밀번호 변경'}
                        </button>
                    </form>
                </div>

                {/* 로그아웃 */}
                <div className="bento-card p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 mb-0.5">로그아웃</p>
                            <p className="text-sm text-slate-400 dark:text-slate-500">현재 세션을 종료합니다</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold rounded-xl transition-all border border-rose-200 dark:border-rose-800"
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

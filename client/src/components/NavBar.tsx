import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Book, CheckSquare, Settings, LogOut, User, ChevronDown, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const NavBar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [profileOpen, setProfileOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    // 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        toast.success('로그아웃 되었습니다.');
        navigate('/login');
    };

    const navItems = [
        { path: '/', label: '홈', icon: Home },
        { path: '/manuals', label: '매뉴얼', icon: Book },
        { path: '/tasks', label: '업무', icon: CheckSquare },
        ...(user?.role === 'ADMIN' ? [{ path: '/admin', label: '관리자', icon: Shield }] : []),
    ];

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'ADMIN': return { label: '관리자', className: 'bg-amber-100 text-amber-700 border border-amber-200' };
            case 'MANAGER': return { label: '매니저', className: 'bg-blue-100 text-blue-700 border border-blue-200' };
            default: return { label: '일반', className: 'bg-slate-100 text-slate-600 border border-slate-200' };
        }
    };

    const badge = user ? getRoleBadge(user.role) : null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center px-6 gap-2 shadow-sm">
            {/* 로고 */}
            <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 mr-4 group"
            >
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-md group-hover:scale-105 transition-transform">
                    CT
                </div>
                <span className="font-extrabold text-slate-900 tracking-tight text-sm hidden sm:block">
                    createTree <span className="text-blue-600">Office</span>
                </span>
            </button>

            {/* 네비게이션 링크 */}
            <div className="flex items-center gap-1">
                {navItems.map(({ path, label, icon: Icon }) => {
                    const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
                    return (
                        <button
                            key={path}
                            onClick={() => navigate(path)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${isActive
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                        >
                            <Icon size={14} />
                            <span className="hidden sm:block">{label}</span>
                        </button>
                    );
                })}
            </div>

            {/* 오른쪽 프로필 영역 */}
            <div className="ml-auto relative" ref={dropdownRef}>
                <button
                    onClick={() => setProfileOpen(prev => !prev)}
                    className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200 group"
                >
                    <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        {user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="hidden sm:flex flex-col items-start">
                        <span className="text-[12px] font-bold text-slate-900 leading-none">{user?.name || '사용자'}</span>
                        {badge && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${badge.className}`}>
                                {badge.label}
                            </span>
                        )}
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* 드롭다운 메뉴 */}
                {profileOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 overflow-hidden">
                        {/* 유저 정보 */}
                        <div className="px-4 py-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">
                                    {user?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900">{user?.name}</p>
                                    <p className="text-xs text-slate-400 truncate max-w-[120px]">{user?.email}</p>
                                </div>
                            </div>
                        </div>

                        {/* 마이페이지 메뉴 아이템 */}
                        <div className="py-1">
                            <button
                                onClick={() => { navigate('/mypage'); setProfileOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            >
                                <User size={15} />
                                마이페이지
                            </button>
                            {user?.role === 'ADMIN' && (
                                <button
                                    onClick={() => { navigate('/admin'); setProfileOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                                >
                                    <Settings size={15} />
                                    관리자 설정
                                </button>
                            )}
                        </div>

                        <div className="border-t border-slate-100 py-1">
                            <button
                                onClick={() => { handleLogout(); setProfileOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-rose-500 hover:bg-rose-50 transition-colors font-semibold"
                            >
                                <LogOut size={15} />
                                로그아웃
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default NavBar;

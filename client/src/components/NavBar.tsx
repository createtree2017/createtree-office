import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Book, CheckSquare, Settings, LogOut, User, ChevronDown, Shield, Sun, Moon, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

// 다크모드 훅
const useDarkMode = () => {
    const [isDark, setIsDark] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        if (saved !== null) return saved === 'true';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('darkMode', String(isDark));
    }, [isDark]);

    return { isDark, toggle: () => setIsDark(prev => !prev) };
};

const NavBar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [profileOpen, setProfileOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { isDark, toggle } = useDarkMode();

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
        { path: '/drive', label: '자료실', icon: FolderOpen },

        ...(user?.role === 'ADMIN' ? [{ path: '/admin', label: '관리자', icon: Shield }] : []),
    ];

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'ADMIN': return { label: '관리자', className: 'bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40' };
            case 'MANAGER': return { label: '매니저', className: 'bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40' };
            default: return { label: '일반', className: 'bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-600/40 dark:text-slate-300 dark:border-slate-500/40' };
        }
    };

    const badge = user ? getRoleBadge(user.role) : null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-white dark:bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center px-6 gap-2 shadow-sm dark:shadow-black/20">
            {/* 로고 */}
            <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 mr-4 group"
            >
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-md group-hover:scale-105 transition-transform">
                    CT
                </div>
                <span className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight text-sm hidden sm:block">
                    createTree <span className="text-blue-500">Office</span>
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
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                                }`}
                        >
                            <Icon size={14} />
                            <span className="hidden sm:block">{label}</span>
                        </button>
                    );
                })}
            </div>

            {/* 오른쪽 영역: 다크모드 토글 + 프로필 */}
            <div className="ml-auto flex items-center gap-2">
                {/* 다크모드 토글 버튼 */}
                <button
                    onClick={toggle}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-slate-300 transition-all"
                    title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
                >
                    {isDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                {/* 프로필 드롭다운 */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setProfileOpen(prev => !prev)}
                        className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all border border-transparent hover:border-[hsl(var(--border))] group"
                    >
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="hidden sm:flex flex-col items-start">
                            <span className="text-[12px] font-bold text-slate-900 dark:text-white leading-none">{user?.name || '사용자'}</span>
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
                        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[hsl(var(--card))] rounded-2xl shadow-xl dark:shadow-black/40 border border-[hsl(var(--border))] py-2 overflow-hidden">
                            {/* 유저 정보 */}
                            <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">
                                        {user?.name?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{user?.name}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{user?.email}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="py-1">
                                <button
                                    onClick={() => { navigate('/mypage'); setProfileOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                                >
                                    <User size={15} />
                                    마이페이지
                                </button>
                                {user?.role === 'ADMIN' && (
                                    <button
                                        onClick={() => { navigate('/admin'); setProfileOpen(false); }}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                                    >
                                        <Settings size={15} />
                                        관리자 설정
                                    </button>
                                )}
                            </div>

                            <div className="border-t border-[hsl(var(--border))] py-1">
                                <button
                                    onClick={() => { handleLogout(); setProfileOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors font-semibold"
                                >
                                    <LogOut size={15} />
                                    로그아웃
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default NavBar;

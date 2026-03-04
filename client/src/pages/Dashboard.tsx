import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const navigate = useNavigate();
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-8 pt-20 md:p-16 md:pt-24 flex flex-col items-center justify-center font-sans overflow-hidden">
            <div className="text-center mb-16 animate-in fade-in slide-in-from-top-6 duration-1000">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider mb-6 shadow-sm">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    Internal Management Portal
                </div>
                <h1 className="text-6xl md:text-7xl font-black mb-6 tracking-tight text-slate-900">
                    createTree <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Office</span>
                </h1>
                <p className="text-slate-500 text-xl font-medium max-w-2xl mx-auto leading-relaxed">
                    환영합니다, <span className="text-slate-900 font-bold">{user?.name || '사용자'}</span>님. <br />
                    오늘의 소중한 기록과 업무를 효율적으로 관리해보세요.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
                <div
                    onClick={() => navigate('/manuals')}
                    className="bento-card p-10 group cursor-pointer hover:border-blue-500/50 hover:bg-white hover:ring-8 hover:ring-blue-50/50 group"
                >
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.246 18.477 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-3 text-slate-900 transition-colors">Manuals</h2>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        실시간 공동 편집과 트리 구조를 지원하는 <br />
                        지능형 업무 매뉴얼 시스템
                    </p>
                </div>

                <div
                    onClick={() => navigate('/tasks')}
                    className="bento-card p-10 group cursor-pointer hover:border-emerald-500/50 hover:bg-white hover:ring-8 hover:ring-emerald-50/50"
                >
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-3 text-slate-900 transition-colors">Tasks</h2>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        칸반 보드와 캘린더 기반의 <br />
                        직관적인 프로젝트 진행 관리
                    </p>
                </div>

                {user?.role === 'ADMIN' && (
                    <div
                        onClick={() => navigate('/admin')}
                        className="bento-card p-10 group cursor-pointer hover:border-amber-500/50 hover:bg-white hover:ring-8 hover:ring-amber-50/50 md:col-span-2 flex items-center gap-10"
                    >
                        <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-600 group-hover:rotate-12 transition-transform">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </div>
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold mb-2 text-slate-900 group-hover:text-amber-600 transition-colors">Admin Management</h2>
                            <p className="text-slate-500 font-medium leading-relaxed">직원 가입 승인 및 권한 등급을 효율적으로 조정할 수 있는 관리자 대시보드</p>
                        </div>
                    </div>
                )}
            </div>

            <footer className="mt-20 text-slate-400 text-[13px] tracking-widest uppercase font-bold text-center border-t border-slate-100 pt-8 w-full max-w-2xl">
                "Empowering efficiency at createTree Office"
            </footer>
        </div>
    );
};

export default Dashboard;

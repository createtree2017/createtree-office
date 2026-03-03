import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const navigate = useNavigate();
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-sans">
            <div className="absolute top-4 right-4 flex items-center gap-4">
                <span className="text-slate-400 text-sm">{user?.name} ({user?.role})</span>
                <button
                    onClick={handleLogout}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded text-sm transition-colors cursor-pointer"
                >
                    Logout
                </button>
            </div>

            <h1 className="text-5xl font-extrabold mb-6 bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                createTree Office
            </h1>
            <p className="text-slate-400 text-xl mb-12 text-center max-w-2xl leading-relaxed">
                사내 인수인계 매뉴얼 및 업무 효율화를 위한 <br />
                프리미엄 관리자 포털에 오신 것을 환영합니다.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                <div
                    onClick={() => navigate('/manuals')}
                    className="p-8 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-xl hover:border-blue-500/50 transition-all cursor-pointer group"
                >
                    <h2 className="text-2xl font-bold mb-4 text-blue-400 group-hover:text-blue-300">Manuals</h2>
                    <p className="text-slate-400">인수인계 매뉴얼 작성 및 조회 (인플레이스 편집 지원)</p>
                </div>

                <div className="p-8 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-xl hover:border-emerald-500/50 transition-all cursor-pointer group">
                    <h2 className="text-2xl font-bold mb-4 text-emerald-400 group-hover:text-emerald-300">Tasks</h2>
                    <p className="text-slate-400">업무 할 일 및 캘린더 관리 (준비 중)</p>
                </div>

                {user?.role === 'ADMIN' && (
                    <div
                        onClick={() => navigate('/admin')}
                        className="p-8 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-xl hover:border-amber-500/50 transition-all cursor-pointer group md:col-span-2"
                    >
                        <h2 className="text-2xl font-bold mb-4 text-amber-400 group-hover:text-amber-300">Admin Management</h2>
                        <p className="text-slate-400">직원 가입 승인 및 권한 등급 조정 (최고관리자 전용)</p>
                    </div>
                )}
            </div>

            <footer className="mt-16 text-slate-500 text-sm italic">
                Authorized Access Only.
            </footer>
        </div>
    );
};

export default Dashboard;

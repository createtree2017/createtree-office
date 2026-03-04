import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (result.success) {
                localStorage.setItem('token', result.data.token);
                localStorage.setItem('user', JSON.stringify(result.data.user));
                navigate('/');
            } else {
                if (result.code === 'PENDING_APPROVAL') {
                    setMessage(result.message);
                } else {
                    setError(result.message);
                }
            }
        } catch (err) {
            setError('서버와 통신 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">createTree <span className="text-blue-600">Office</span></h1>
                    <p className="text-slate-500 font-medium">관리 시스템에 로그인하여 시작하세요.</p>
                </div>

                <div className="bento-card p-10 bg-white ring-8 ring-slate-50/50">
                    <h2 className="text-2xl font-bold text-slate-900 mb-8">Login</h2>

                    {error && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-500 p-4 rounded-2xl mb-8 text-sm font-semibold flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="bg-blue-50 border border-blue-100 text-blue-600 p-4 rounded-2xl mb-8 text-sm font-semibold flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            {message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                                required
                                placeholder="name@company.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                                required
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-slate-200 hover:shadow-2xl active:scale-95 mt-4"
                        >
                            Sign In
                        </button>
                    </form>

                    <p className="mt-10 text-center text-slate-400 text-sm font-medium">
                        계정이 없으신가요? <Link to="/register" className="text-blue-600 font-bold hover:underline underline-offset-4 ml-1">회원가입</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;

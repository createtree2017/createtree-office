import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    isApproved: boolean;
}

const AdminPage = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            const response = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                setUsers(result.data);
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            toast.error('사용자 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const updateUser = async (id: number, data: Partial<User>) => {
        try {
            const response = await fetch(`/api/admin/users/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('변경되었습니다.');
                fetchUsers();
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            toast.error('변경 중 오류가 발생했습니다.');
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-8 md:p-12 lg:p-16 pt-20 md:pt-24">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
                            시스템 관리
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">사용자 관리</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-3 font-medium text-lg">직원 가입 승인 및 권한 등급을 중앙 관리합니다.</p>
                    </div>
                </div>

                <div className="bento-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-slate-800/60 border-b-2 border-[hsl(var(--border))] text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-[0.15em]">
                                    <th className="px-8 py-5">기본 정보</th>
                                    <th className="px-8 py-5 text-center">연락정보</th>
                                    <th className="px-8 py-5 text-center">권한</th>
                                    <th className="px-8 py-5 text-right">승인 상태</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[hsl(var(--border))]">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-8 py-24 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-400 dark:text-slate-500 font-bold animate-pulse">
                                            <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                                            정보 불러오는 중...
                                        </div>
                                    </td></tr>
                                ) : users.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200 group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-sm group-hover:bg-blue-200 dark:group-hover:bg-blue-500/30 transition-colors">
                                                    {u.name.charAt(0)}
                                                </div>
                                                <span className="font-bold text-slate-900 dark:text-white text-[15px]">{u.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-center text-slate-500 dark:text-slate-400 font-medium text-sm">{u.email}</td>
                                        <td className="px-8 py-6 text-center">
                                            <select
                                                value={u.role}
                                                onChange={(e) => updateUser(u.id, { role: e.target.value })}
                                                className="bg-slate-100 dark:bg-slate-700 border border-[hsl(var(--border))] rounded-xl px-4 py-2.5 text-[13px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none shadow-sm"
                                            >
                                                <option value="USER">일반 사용자</option>
                                                <option value="MANAGER">매니저</option>
                                                <option value="ADMIN">관리자</option>
                                            </select>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => updateUser(u.id, { isApproved: !u.isApproved })}
                                                className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm ${u.isApproved
                                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 dark:hover:bg-emerald-500 dark:hover:text-white'
                                                    : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 hover:bg-rose-500 hover:text-white hover:border-rose-500 dark:hover:bg-rose-500 dark:hover:text-white scale-105'
                                                    }`}
                                            >
                                                {u.isApproved ? '승인됨' : '승인 대기'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPage;

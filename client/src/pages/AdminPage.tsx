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

    useEffect(() => {
        fetchUsers();
    }, []);

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-slate-900 p-8 md:p-12 lg:p-16">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-600 text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
                            System Administration
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">User Management</h1>
                        <p className="text-slate-500 mt-3 font-medium text-lg">직원 가입 승인 및 권한 등급을 중앙 관리합니다.</p>
                    </div>
                </div>

                <div className="bento-card bg-white border border-slate-200 overflow-hidden shadow-xl shadow-slate-100/50">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-[0.15em]">
                                    <th className="px-8 py-5">General Info</th>
                                    <th className="px-8 py-5 text-center">Contact</th>
                                    <th className="px-8 py-5 text-center">Permission Role</th>
                                    <th className="px-8 py-5 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-8 py-24 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-300 font-bold tracking-tighter animate-pulse">
                                            <div className="w-10 h-10 border-4 border-slate-100 border-t-slate-300 rounded-full animate-spin"></div>
                                            FETCHING ACCOUNTS...
                                        </div>
                                    </td></tr>
                                ) : users.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50/50 transition-all duration-200 group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                                    {u.name.charAt(0)}
                                                </div>
                                                <span className="font-bold text-slate-900 text-[15px]">{u.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-center text-slate-500 font-medium text-sm italic">{u.email}</td>
                                        <td className="px-8 py-6 text-center">
                                            <select
                                                value={u.role}
                                                onChange={(e) => updateUser(u.id, { role: e.target.value })}
                                                className="bg-slate-100 border-transparent rounded-xl px-4 py-2.5 text-[13px] font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white focus:border-blue-500 transition-all cursor-pointer appearance-none shadow-sm"
                                            >
                                                <option value="USER">Standard User</option>
                                                <option value="MANAGER">Manager</option>
                                                <option value="ADMIN">System Admin</option>
                                            </select>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => updateUser(u.id, { isApproved: !u.isApproved })}
                                                className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm ${u.isApproved
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 group-hover:bg-emerald-500 group-hover:text-white group-hover:shadow-emerald-100/50'
                                                    : 'bg-rose-50 text-rose-500 border border-rose-100 cursor-pointer hover:bg-rose-500 hover:text-white hover:shadow-rose-100 shadow-xl scale-105'
                                                    }`}
                                            >
                                                {u.isApproved ? 'Approved' : 'Pending Request'}
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

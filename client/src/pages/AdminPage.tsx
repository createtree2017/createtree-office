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
        <div className="min-h-screen bg-slate-950 text-white p-12">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold mb-8 text-blue-400">직원 관리 및 가입 승인</h1>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-800/50 border-b border-slate-800 text-slate-400 text-sm">
                                <th className="px-6 py-4">이름</th>
                                <th className="px-6 py-4">이메일</th>
                                <th className="px-6 py-4">등급</th>
                                <th className="px-6 py-4">승인 상태</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 animate-pulse">로딩 중...</td></tr>
                            ) : users.map(u => (
                                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4 font-medium">{u.name}</td>
                                    <td className="px-6 py-4 text-slate-400">{u.email}</td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={u.role}
                                            onChange={(e) => updateUser(u.id, { role: e.target.value })}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                            <option value="USER">직원</option>
                                            <option value="MANAGER">관리자</option>
                                            <option value="ADMIN">최고관리자</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => updateUser(u.id, { isApproved: !u.isApproved })}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${u.isApproved
                                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-500 border border-amber-500/20 cursor-pointer hover:bg-amber-500/20'
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
    );
};

export default AdminPage;

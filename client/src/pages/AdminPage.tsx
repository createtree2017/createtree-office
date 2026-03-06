import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    clientId?: number | null;
    isApproved: boolean;
    createdAt?: string;
    thumbnail?: string | null;
}

interface Client {
    id: number;
    name: string;
    driveFolderId?: string;
}

const AdminPage = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [newClientName, setNewClientName] = useState('');
    const [creatingClient, setCreatingClient] = useState(false);
    const [syncingClients, setSyncingClients] = useState(false);

    // 탭 관리 및 병원 수정 상태
    const [activeTab, setActiveTab] = useState<'users' | 'clients'>('users');
    const [editingClientId, setEditingClientId] = useState<number | null>(null);
    const [editingClientName, setEditingClientName] = useState('');

    // 회원 리스트 정렬 상태
    const [userSortBy, setUserSortBy] = useState<'createdAtDesc' | 'createdAtAsc' | 'nameAsc' | 'role' | 'status'>('createdAtDesc');

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

    const fetchClients = async () => {
        try {
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                setClients(result.data);
            }
        } catch (err) {
            console.error('거래처 목록 불러오기 실패:', err);
        }
    };

    const handleSyncClients = async () => {
        setSyncingClients(true);
        try {
            const response = await fetch('/api/clients/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                toast.success(result.message);
                fetchClients(); // 갱신된 목록 즉시 다시 불러오기
            } else {
                toast.error(result.message || '동기화에 실패했습니다.');
            }
        } catch (err) {
            toast.error('동기화 중 오류가 발생했습니다.');
        } finally {
            setSyncingClients(false);
        }
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClientName.trim()) return;
        setCreatingClient(true);
        try {
            const response = await fetch('/api/clients', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ name: newClientName }),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('새 거래처 및 드라이브 폴더가 정상 생성되었습니다.');
                setNewClientName('');
                fetchClients();
            } else {
                toast.error(result.message || '거래처 생성에 실패했습니다.');
            }
        } catch (err) {
            toast.error('거래처 생성 중 네트워크 오류가 발생했습니다.');
        } finally {
            setCreatingClient(false);
        }
    };

    const handleUpdateClient = async (id: number) => {
        if (!editingClientName.trim()) return;
        try {
            const response = await fetch(`/api/clients/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ name: editingClientName }),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('거래처 이름이 수정되고 구글 드라이브와 동기화되었습니다.');
                setEditingClientId(null);
                setEditingClientName('');
                fetchClients();
            } else {
                toast.error(result.message || '병원 이름 수정에 실패했습니다.');
            }
        } catch (err) {
            toast.error('수정 중 네트워크 오류가 발생했습니다.');
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

    const handleDeleteUser = async (id: number) => {
        if (!window.confirm('❗️이 사용자를 정말 영구적으로 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) return;

        try {
            const response = await fetch(`/api/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                toast.success('사용자가 완전 삭제되었습니다.');
                fetchUsers();
            } else {
                toast.error(result.message || '삭제에 실패했습니다.');
            }
        } catch (err) {
            toast.error('삭제 중 네트워크 오류가 발생했습니다.');
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchClients();
    }, []);

    // 회원 정렬 로직 적용
    const sortedUsers = [...users].sort((a, b) => {
        if (userSortBy === 'createdAtDesc') {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (userSortBy === 'createdAtAsc') {
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        if (userSortBy === 'nameAsc') {
            return a.name.localeCompare(b.name);
        }
        if (userSortBy === 'role') {
            const roleOrder: any = { 'ADMIN': 1, 'MANAGER': 2, 'HOSPITAL_ADMIN': 3, 'USER': 4 };
            return roleOrder[a.role] - roleOrder[b.role];
        }
        if (userSortBy === 'status') {
            return (a.isApproved === b.isApproved) ? 0 : a.isApproved ? 1 : -1;
        }
        return 0;
    });

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-8 md:p-12 lg:p-16 pt-20 md:pt-24">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
                            시스템 관리
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">사용자 및 병원 관리</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-3 font-medium text-lg">직원 승인 관리와 병원(거래처) 드라이브 폴더 연동을 종합 제어합니다.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-6 mb-8 border-b border-[hsl(var(--border))]">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`pb-4 px-2 text-[15px] font-bold transition-all relative ${activeTab === 'users' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        회원 관리
                        {activeTab === 'users' && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('clients')}
                        className={`pb-4 px-2 text-[15px] font-bold transition-all relative ${activeTab === 'clients' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        병원 관리
                        {activeTab === 'clients' && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                    </button>
                </div>

                {activeTab === 'users' ? (
                    <div className="bento-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800/60 border-b-2 border-[hsl(var(--border))] text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-[0.15em]">
                                        <th className="px-8 py-5">
                                            <div className="flex items-center gap-3">
                                                기본 정보
                                                <select
                                                    value={userSortBy}
                                                    onChange={(e) => setUserSortBy(e.target.value as any)}
                                                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] font-semibold tracking-normal text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:border-blue-400 transition-colors cursor-pointer ml-2"
                                                >
                                                    <option value="createdAtDesc">가입일시 (최신순)</option>
                                                    <option value="createdAtAsc">가입일시 (오래된순)</option>
                                                    <option value="nameAsc">이름순 (가나다)</option>
                                                    <option value="role">권한 높은순</option>
                                                    <option value="status">승인 대기자 우선</option>
                                                </select>
                                            </div>
                                        </th>
                                        <th className="px-8 py-5 text-center">연락정보</th>
                                        <th className="px-8 py-5 text-center">권한</th>
                                        <th className="px-8 py-5 text-right">상태 관리</th>
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
                                    ) : sortedUsers.map(u => (
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
                                                    className="w-full bg-slate-100 dark:bg-slate-700 border border-[hsl(var(--border))] rounded-xl px-4 py-2.5 text-[13px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none shadow-sm"
                                                >
                                                    <option value="USER">일반대기사용자(권한없음)</option>
                                                    <option value="HOSPITAL_ADMIN">거래처(원장) 관리자</option>
                                                    <option value="MANAGER">매니저(내부직원)</option>
                                                    <option value="ADMIN">시스템 최고관리자</option>
                                                </select>
                                                {u.role === 'HOSPITAL_ADMIN' && (
                                                    <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                                                        <select
                                                            value={u.clientId || ''}
                                                            onChange={(e) => updateUser(u.id, { clientId: e.target.value ? parseInt(e.target.value) : null })}
                                                            className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2 text-[12px] font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all cursor-pointer appearance-none shadow-sm"
                                                        >
                                                            <option value="">거래처(병원) 배정 대기중</option>
                                                            {clients.map(c => (
                                                                <option key={c.id} value={c.id}>🏥 {c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => updateUser(u.id, { isApproved: !u.isApproved })}
                                                        className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm ${u.isApproved
                                                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 dark:hover:bg-emerald-500 dark:hover:text-white'
                                                            : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 hover:bg-rose-500 hover:text-white hover:border-rose-500 dark:hover:bg-rose-500 dark:hover:text-white scale-105'
                                                            }`}
                                                    >
                                                        {u.isApproved ? '승인됨' : '승인 대기'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id)}
                                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50"
                                                        title="사용자 완전 삭제"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pt-2">
                        {/* 병원 관리 탭: 신규 병원 등록 폼 */}
                        <form onSubmit={handleCreateClient} className="flex flex-col gap-3 p-6 bg-white dark:bg-[hsl(var(--card))] rounded-2xl shadow-sm border border-slate-200 dark:border-[hsl(var(--border))] w-full xl:w-2/3">
                            <label className="text-sm font-black text-blue-600 dark:text-blue-400 tracking-wide">🏥 병원(거래처) 신규 등록</label>
                            <p className="text-xs text-slate-500 mb-2">등록 시 구글 드라이브 내에 <strong className="text-blue-500">전용 폴더가 동기화 자동 생성</strong>되고 즉시 권한을 배정할 수 있습니다.</p>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={newClientName}
                                    onChange={e => setNewClientName(e.target.value)}
                                    placeholder="생성할 병원명 입력 (예: 구글치괴)"
                                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold"
                                />
                                <button
                                    disabled={creatingClient || !newClientName.trim()}
                                    type="submit"
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 shrink-0"
                                >
                                    {creatingClient ? '폴더 연동 중...' : '등록 및 폴더 동기화'}
                                </button>
                            </div>
                        </form>

                        {/* 리스트 헤더 및 목록 새로고침 버튼 */}
                        <div className="flex items-center justify-between mt-6 mb-2">
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                등록된 병원 목록
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs px-2.5 py-0.5 rounded-full font-bold">{clients.length}</span>
                            </h3>
                            <button
                                onClick={handleSyncClients}
                                disabled={syncingClients}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                            >
                                <span className={syncingClients ? "animate-spin" : ""}>🔄</span>
                                {syncingClients ? "동기화 중..." : "구글 드라이브 목록 새로고침"}
                            </button>
                        </div>

                        {/* 병원 리스트 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {clients.map(client => (
                                <div key={client.id} className="p-6 bg-white dark:bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-sm hover:border-blue-300 dark:hover:border-blue-500/50 transition-all relative group flex flex-col justify-between min-h-[140px]">
                                    {editingClientId === client.id ? (
                                        <div className="flex flex-col gap-3 h-full justify-between animate-in fade-in zoom-in-95 duration-200">
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 mb-2 block">병원명 수정 (드라이브 동기화)</label>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editingClientName}
                                                    onChange={e => setEditingClientName(e.target.value)}
                                                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleUpdateClient(client.id);
                                                        if (e.key === 'Escape') setEditingClientId(null);
                                                    }}
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2 mt-4">
                                                <button
                                                    onClick={() => { setEditingClientId(null); setEditingClientName(''); }}
                                                    className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                                >
                                                    취소 (Esc)
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateClient(client.id)}
                                                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                                                >
                                                    저장 (Enter)
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-xl shadow-sm border border-blue-100 dark:border-blue-800/50">
                                                        🏥
                                                    </div>
                                                    <button
                                                        onClick={() => { setEditingClientId(client.id); setEditingClientName(client.name); }}
                                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 text-[13px] opacity-0 group-hover:opacity-100 transition-all font-bold flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                                                    >
                                                        <span className="text-base">✏️</span> 이름 변경
                                                    </button>
                                                </div>
                                                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{client.name}</h3>
                                            </div>
                                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                                                <p className="text-[11px] text-slate-400 font-medium break-all flex flex-col gap-1">
                                                    <span className="uppercase tracking-widest text-[9px] font-bold text-slate-300 dark:text-slate-600">Drive Sync ID</span>
                                                    <span className="font-mono text-slate-500">{client.driveFolderId || '폴더 연동 없음'}</span>
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPage;

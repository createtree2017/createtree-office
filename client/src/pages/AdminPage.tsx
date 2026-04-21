import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SubNav from '../components/SubNav';
import ClientFilter from '../components/ClientFilter';
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
    telegramChatId?: string | null;
    telegramInviteCode?: string | null;
    telegramConnectedAt?: string | null;
    contractEndedAt?: string | null;
    contractStartDate?: string | null;
    contractEndDate?: string | null;
    contractFileDriveId?: string | null;
    contractFileName?: string | null;
    businessRegDriveId?: string | null;
    businessRegFileName?: string | null;
    linkedQuotationId?: number | null;
    linkedContractId?: number | null;
    deletedAt?: string | null;
    activeContracts?: { id: number, contractNumber: string, title: string, startDate: string, endDate: string }[];
}

interface LinkableQuotation {
    id: number;
    quotationNumber: string;
    title: string;
    clientName?: string;
    totalAmount: number;
    status: string;
}

interface LinkableContract {
    id: number;
    contractNumber: string;
    title: string;
    clientName?: string;
    totalAmount: number;
    status: string;
}

interface Template {
    id: number;
    title: string;
    description?: string | null;
}

const AdminPage = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [newClientName, setNewClientName] = useState('');
    const [creatingClient, setCreatingClient] = useState(false);
    const [syncingClients, setSyncingClients] = useState(false);
    const [isSortMode, setIsSortMode] = useState(false);
    const [draggedClientId, setDraggedClientId] = useState<number | null>(null);

    // 탭 관리
    const [searchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') as 'users' | 'clients' | null;
    const [activeTab, setActiveTab] = useState<'users' | 'clients'>(tabParam || 'users');
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [editingClientId, setEditingClientId] = useState<number | null>(null);
    const [editingClientName, setEditingClientName] = useState('');
    const [businessRegClientId, setBusinessRegClientId] = useState<number | null>(null);
    const [businessRegFile, setBusinessRegFile] = useState<File | null>(null);

    const [activeContractsModalClientId, setActiveContractsModalClientId] = useState<number | null>(null);

    useEffect(() => {
        if (tabParam && ['users', 'clients'].includes(tabParam)) {
            setActiveTab(tabParam);
        }
    }, [tabParam]);

    // 회원 정렬
    const [userSortBy, setUserSortBy] = useState<'createdAtDesc' | 'createdAtAsc' | 'nameAsc' | 'role' | 'status'>('createdAtDesc');
    const [filterClientId, setFilterClientId] = useState<number | 'all' | 'unassigned'>('all');

    // ===== 활성 계약 서비스 상품 상태 =====
    const [activeServicesMap, setActiveServicesMap] = useState<Record<number, { contractNumber: string; services: { serviceName: string; items: any[] }[] } | null>>({});

    // === TanStack Query 기반 데이터 페칭 ===
    const queryClient = useQueryClient();

    const { data: usersData = [], isLoading: usersLoading } = useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const response = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Failed to fetch users');
            return result.data;
        },
        staleTime: 2 * 60 * 1000,
    });

    const { data: clientsBundle, isLoading: clientsLoading } = useQuery({
        queryKey: ['admin-clients'],
        queryFn: async () => {
            const [clientsRes, servicesRes] = await Promise.all([
                fetch('/api/clients', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
                fetch('/api/quotations/all-approved-services', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
            ]);
            const clientsResult = await clientsRes.json();
            const servicesResult = await servicesRes.json();

            let servicesMap: Record<number, any> = {};
            if (servicesResult.success && servicesResult.data) {
                for (const clientId in servicesResult.data) {
                    const servicesList = servicesResult.data[clientId];
                    if (servicesList && servicesList.length > 0) {
                        const svcMap: Record<string, { serviceName: string; items: any[] }> = {};
                        for (const conf of servicesList) {
                            if (!svcMap[conf.serviceName]) {
                                svcMap[conf.serviceName] = { serviceName: conf.serviceName, items: [] };
                            }
                            svcMap[conf.serviceName].items.push(conf);
                        }
                        servicesMap[Number(clientId)] = { contractNumber: '', services: Object.values(svcMap) };
                    }
                }
            }
            return {
                clients: clientsResult.success ? clientsResult.data : [],
                servicesMap,
            };
        },
        staleTime: 2 * 60 * 1000,
    });

    const loading = usersLoading || clientsLoading;

    // 캐시 → 로컬 state 동기화
    useEffect(() => { setUsers(usersData); }, [usersData]);
    useEffect(() => {
        if (clientsBundle) {
            setClients(clientsBundle.clients);
            setActiveServicesMap(clientsBundle.servicesMap);
        }
    }, [clientsBundle]);

    // fetchUsers / fetchClients 대체 래퍼
    const fetchUsers = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    const fetchClients = () => queryClient.invalidateQueries({ queryKey: ['admin-clients'] });



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
                fetchClients();
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
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ name: newClientName.trim() }),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('새 거래처 및 드라이브 폴더가 생성되었습니다.');
                setNewClientName('');
                setShowRegisterModal(false);
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
            const formData = new FormData();
            formData.append('name', editingClientName.trim());
            const response = await fetch(`/api/clients/${id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData,
            });
            const result = await response.json();
            if (result.success) {
                toast.success('거래처 이름이 수정되었습니다.');
                setEditingClientId(null);
                setEditingClientName('');
                fetchClients();
            } else {
                toast.error(result.message || '수정에 실패했습니다.');
            }
        } catch (err) {
            toast.error('수정 중 오류가 발생했습니다.');
        }
    };

    const handleUploadBusinessReg = async (client: Client) => {
        if (!businessRegFile) return;
        try {
            const formData = new FormData();
            formData.append('businessRegFile', businessRegFile);
            const response = await fetch(`/api/clients/${client.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData,
            });
            const result = await response.json();
            if (result.success) {
                toast.success('사업자등록증 첨부 완료');
                setBusinessRegClientId(null);
                setBusinessRegFile(null);
                fetchClients();
            } else {
                toast.error(result.message || '첨부에 실패했습니다.');
            }
        } catch (err) {
            toast.error('첨부 중 오류가 발생했습니다.');
        }
    };

    // 거래처 삭제 (소프트 삭제 — 폴더 휴지통 이동)
    const handleDeleteClient = async (client: Client) => {
        if (!window.confirm(`"${client.name}" 거래처를 삭제하시겠습니까?\n\n• 드라이브 폴더가 휴지통으로 이동됩니다.\n• 연결된 견적서/계약서는 유지됩니다.`)) return;
        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                fetchClients();
            } else {
                toast.error(data.message || '삭제 실패');
            }
        } catch {
            toast.error('오류가 발생했습니다.');
        }
    };

    const handleTelegramDisconnect = async (clientId: number) => {
        if (!window.confirm('Telegram 연동을 해제하시겠습니까?')) return;
        try {
            const response = await fetch(`/api/notification/telegram/${clientId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                toast.success('Telegram 연동이 해제되었습니다.');
                fetchClients();
            }
        } catch (err) {
            toast.error('연동 해제 중 오류');
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
        if (!window.confirm('이 사용자를 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(`/api/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                toast.success('사용자가 삭제되었습니다.');
                fetchUsers();
            } else {
                toast.error(result.message || '삭제에 실패했습니다.');
            }
        } catch (err) {
            toast.error('삭제 중 오류가 발생했습니다.');
        }
    };



    // 회원 정렬
    const sortedUsers = [...users].sort((a, b) => {
        if (userSortBy === 'createdAtDesc') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        if (userSortBy === 'createdAtAsc') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        if (userSortBy === 'nameAsc') return a.name.localeCompare(b.name);
        if (userSortBy === 'role') {
            const roleOrder: any = { 'ADMIN': 1, 'MANAGER': 2, 'HOSPITAL_ADMIN': 3, 'USER': 4 };
            return roleOrder[a.role] - roleOrder[b.role];
        }
        if (userSortBy === 'status') return (a.isApproved === b.isApproved) ? 0 : a.isApproved ? 1 : -1;
        return 0;
    });

    const filteredUsers = filterClientId === 'all'
        ? sortedUsers
        : filterClientId === 'unassigned'
            ? sortedUsers.filter(u => !u.clientId)
            : sortedUsers.filter(u => u.clientId === filterClientId);

    const filteredClients = filterClientId === 'all'
        ? clients
        : clients.filter(c => c.id === filterClientId);

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-8 md:p-12 lg:p-16 pt-20 md:pt-24">
            <div className="max-w-7xl mx-auto">
                <SubNav group="client" />
                <ClientFilter
                    clients={clients}
                    selectedId={filterClientId}
                    onSelect={setFilterClientId}
                    showUnassigned={activeTab === 'users'}
                />

                {activeTab === 'users' ? (
                    /* ===== 회원 관리 탭 ===== */
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
                                                불러오는 중...
                                            </div>
                                        </td></tr>
                                    ) : filteredUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200 group">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-sm">
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
                                                                <option key={c.id} value={c.id}>{c.name}</option>
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
                                                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-500 hover:text-white'
                                                            : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 hover:bg-rose-500 hover:text-white scale-105'
                                                            }`}
                                                    >
                                                        {u.isApproved ? '승인됨' : '승인 대기'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id)}
                                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                                                        title="사용자 삭제"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
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
                    /* ===== 병원 관리 탭 ===== */
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pt-2">
                        {/* 헤더 */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                등록된 병원 목록
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs px-2.5 py-0.5 rounded-full font-bold">{clients.length}</span>
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setShowRegisterModal(true)}
                                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                                >
                                    + 병원 등록
                                </button>
                                <button
                                    onClick={async () => {
                                        if (isSortMode) {
                                            try {
                                                const orderedIds = clients.map(c => c.id);
                                                const res = await fetch('/api/clients/reorder', {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                                                    body: JSON.stringify({ orderedIds }),
                                                });
                                                const data = await res.json();
                                                if (data.success) toast.success('정렬 저장됨');
                                            } catch { toast.error('정렬 저장 실패'); }
                                        }
                                        setIsSortMode(!isSortMode);
                                    }}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                                        isSortMode
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
                                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    {isSortMode ? '✔ 저장' : '↕ 정렬'}
                                </button>
                                <button
                                    onClick={handleSyncClients}
                                    disabled={syncingClients}
                                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    <span className={syncingClients ? "animate-spin" : ""}>🔄</span>
                                    {syncingClients ? "동기화 중..." : "드라이브 동기화"}
                                </button>
                            </div>
                        </div>

                        {/* 병원 카드 그리드 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredClients.map((client) => (
                                <div
                                    key={client.id}
                                    draggable={isSortMode}
                                    onDragStart={e => { if (!isSortMode) return; setDraggedClientId(client.id); e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                                    onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; setDraggedClientId(null); }}
                                    onDragOver={e => { if (!isSortMode) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDragEnter={e => { if (!isSortMode || draggedClientId === client.id) return; e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'rgb(59, 130, 246)'; }}
                                    onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                                    onDrop={e => {
                                        e.preventDefault();
                                        (e.currentTarget as HTMLElement).style.borderColor = '';
                                        if (!isSortMode || draggedClientId === null || draggedClientId === client.id) return;
                                        setClients(prev => {
                                            const arr = [...prev];
                                            const fromIdx = arr.findIndex(c => c.id === draggedClientId);
                                            const toIdx = arr.findIndex(c => c.id === client.id);
                                            if (fromIdx < 0 || toIdx < 0) return prev;
                                            const [moved] = arr.splice(fromIdx, 1);
                                            arr.splice(toIdx, 0, moved);
                                            return arr;
                                        });
                                    }}
                                    className={`bg-white dark:bg-[hsl(var(--card))] border rounded-xl shadow-sm transition-all relative group ${
                                        isSortMode
                                            ? 'cursor-grab active:cursor-grabbing border-dashed border-slate-300 dark:border-slate-600 hover:border-amber-400'
                                            : 'border-[hsl(var(--border))] hover:border-blue-300 dark:hover:border-blue-500/50'
                                    }`}
                                >
                                    {editingClientId === client.id ? (
                                        /* 이름 편집 모드 */
                                        <div className="p-5 flex flex-col gap-3">
                                            <label className="text-xs font-bold text-slate-500">병원명 수정</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editingClientName}
                                                onChange={e => setEditingClientName(e.target.value)}
                                                className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                                onKeyDown={e => { if (e.key === 'Enter') handleUpdateClient(client.id); if (e.key === 'Escape') setEditingClientId(null); }}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setEditingClientId(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg">취소</button>
                                                <button onClick={() => handleUpdateClient(client.id)} className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg">저장</button>
                                            </div>
                                        </div>
                                    ) : isSortMode ? (
                                        /* 정렬 모드 */
                                        <div className="flex flex-col items-center justify-center p-8 gap-2">
                                            <span className="text-2xl text-slate-400">⠿</span>
                                            <h3 className="text-base font-black text-slate-700 dark:text-slate-200">{client.name}</h3>
                                            <p className="text-[10px] text-slate-400">드래그하여 이동</p>
                                        </div>
                                    ) : (
                                        /* 일반 카드 표시 */
                                        <div className="p-5 flex flex-col gap-3">
                                            {/* 거래처 이름 + 편집 */}
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{client.name}</h3>
                                                <button
                                                    onClick={() => { setEditingClientId(client.id); setEditingClientName(client.name); }}
                                                    className="text-slate-400 hover:text-blue-600 text-xs opacity-0 group-hover:opacity-100 transition-all"
                                                    title="이름 수정"
                                                >
                                                    ✏️
                                                </button>
                                            </div>



                                            {/* 버튼 그리드 — 계약서, 사업자등록증 */}
                                            <div className="grid grid-cols-2 gap-2">
                                                {/* 계약서 목록 버튼 */}
                                                <button
                                                    onClick={() => setActiveContractsModalClientId(client.id)}
                                                    className={`w-full flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-[11px] transition-all border ${
                                                        client.activeContracts && client.activeContracts.length > 0
                                                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-600 hover:bg-blue-200'
                                                            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <span className="font-bold flex items-center gap-1">📄 계약서</span>
                                                    <span className="text-[10px] opacity-80 font-medium">
                                                        {client.activeContracts && client.activeContracts.length > 0 
                                                            ? `진행 중: ${client.activeContracts.length}건` 
                                                            : '진행 중인 계약 없음'}
                                                    </span>
                                                </button>

                                                {/* 사업자등록증 버튼 */}
                                                {client.businessRegDriveId ? (
                                                    <a
                                                        href={`https://drive.google.com/file/d/${client.businessRegDriveId}/view`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 hover:bg-amber-100"
                                                    >
                                                        🏢 사업자등록증
                                                    </a>
                                                ) : (
                                                    <button
                                                        onClick={() => { setBusinessRegClientId(businessRegClientId === client.id ? null : client.id); setBusinessRegFile(null); }}
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-600 hover:border-amber-400 hover:text-amber-500"
                                                    >
                                                        📎 사업자등록증
                                                    </button>
                                                )}

                                                {/* 드라이브 버튼 */}
                                                {client.driveFolderId ? (
                                                    <a
                                                        href={`https://drive.google.com/drive/folders/${client.driveFolderId}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 hover:bg-emerald-100"
                                                    >
                                                        📁 드라이브
                                                    </a>
                                                ) : (
                                                    <span className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700">
                                                        📁 폴더 없음
                                                    </span>
                                                )}
                                            </div>

                                            {/* 사업자등록증 업로드 패널 */}
                                            {businessRegClientId === client.id && (
                                                <div className="p-3 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-lg flex flex-col gap-2 animate-in fade-in duration-200">
                                                    <label className={`flex items-center gap-2 border border-dashed rounded-lg px-3 py-2 cursor-pointer transition-all ${businessRegFile ? 'border-amber-400 bg-amber-50' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}>
                                                        <span className="text-sm">{businessRegFile ? '📎' : '📂'}</span>
                                                        <span className="text-xs text-slate-500 truncate flex-1">{businessRegFile ? businessRegFile.name : '파일 선택'}</span>
                                                        {businessRegFile && <button type="button" onClick={e => { e.preventDefault(); setBusinessRegFile(null); }} className="text-xs text-slate-400 hover:text-rose-500">✕</button>}
                                                        <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setBusinessRegFile(e.target.files?.[0] || null)} />
                                                    </label>
                                                    <button
                                                        onClick={() => handleUploadBusinessReg(client)}
                                                        disabled={!businessRegFile}
                                                        className="w-full py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-40"
                                                    >
                                                        업로드
                                                    </button>
                                                </div>
                                            )}

                                            {/* 실행 서비스 상품 */}
                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                <p className="uppercase tracking-widest text-[9px] font-bold text-slate-400 dark:text-slate-500 mb-1.5">실행 서비스</p>
                                                {activeServicesMap[client.id] ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {activeServicesMap[client.id]!.services.map((svc, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px] font-bold"
                                                                title={svc.items.map((i: any) => i.itemName).join(', ')}
                                                            >
                                                                ✅ {svc.serviceName}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 font-medium">없음</span>
                                                )}
                                            </div>

                                            {/* 텔레그램 연동 */}
                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                <p className="uppercase tracking-widest text-[9px] font-bold text-slate-400 dark:text-slate-500 mb-1.5">Telegram</p>
                                                {client.telegramChatId ? (
                                                    <div className="flex items-center justify-between">
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 dark:text-green-400">
                                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                                            연동됨
                                                        </span>
                                                        <button
                                                            onClick={() => handleTelegramDisconnect(client.id)}
                                                            className="text-[10px] text-slate-400 hover:text-rose-500 font-bold transition-colors"
                                                        >
                                                            해제
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`/연동 ${client.name}`);
                                                            toast.success('연동 명령어가 복사되었습니다!');
                                                        }}
                                                        className="w-full py-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        📋 연동 명령어 복사
                                                    </button>
                                                )}
                                            </div>

                                            {/* 거래처 삭제 버튼 */}
                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                <button
                                                    onClick={() => handleDeleteClient(client)}
                                                    className="w-full py-1.5 text-[10px] font-bold text-rose-400 dark:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
                                                >
                                                    🗑️ 거래처 삭제
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== 병원 등록 모달 ===== */}
            {showRegisterModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget) setShowRegisterModal(false); }}
                >
                    <div className="w-full max-w-md bg-white dark:bg-[hsl(var(--card))] rounded-2xl shadow-2xl border border-slate-200 dark:border-[hsl(var(--border))] animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-0.5">신규 등록</p>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">병원(거래처) 등록</h2>
                            </div>
                            <button onClick={() => setShowRegisterModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition-colors font-bold text-lg">✕</button>
                        </div>
                        <form onSubmit={handleCreateClient} className="p-6 flex flex-col gap-4">
                            <p className="text-xs text-slate-400 -mt-2">등록 시 구글 드라이브 내에 <strong className="text-blue-500">전용 폴더가 자동 생성</strong>됩니다.</p>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">병원명 *</span>
                                <input
                                    autoFocus
                                    type="text"
                                    value={newClientName}
                                    onChange={e => setNewClientName(e.target.value)}
                                    placeholder="예: 포유문산부인과"
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold"
                                />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowRegisterModal(false)} className="flex-1 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 transition-all">취소</button>
                                <button type="submit" disabled={creatingClient || !newClientName.trim()} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50">
                                    {creatingClient ? '생성 중...' : '등록'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 다중 계약서 팝업 모달 */}
            {activeContractsModalClientId && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveContractsModalClientId(null)}>
                    <div className="w-full max-w-md bg-white dark:bg-[hsl(var(--card))] rounded-2xl shadow-2xl border border-slate-200 dark:border-[hsl(var(--border))] animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-0.5">계약 목록</p>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                                    {clients.find(c => c.id === activeContractsModalClientId)?.name}
                                </h2>
                            </div>
                            <button onClick={() => setActiveContractsModalClientId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition-colors font-bold text-lg">✕</button>
                        </div>
                        <div className="p-6 flex flex-col gap-3 overflow-y-auto">
                            {clients.find(c => c.id === activeContractsModalClientId)?.activeContracts?.length ? (
                                clients.find(c => c.id === activeContractsModalClientId)!.activeContracts!.map(ct => (
                                    <button
                                        key={ct.id}
                                        onClick={() => navigate(`/contracts?viewId=${ct.id}`)}
                                        className="w-full text-left px-4 py-3 rounded-xl border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:border-blue-400 transition-all flex flex-col gap-1"
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{ct.title}</p>
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full">활성</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500">{ct.contractNumber}</p>
                                        <p className="text-[11px] text-slate-500 font-medium">{ct.startDate} ~ {ct.endDate}</p>
                                    </button>
                                ))
                            ) : (
                                <p className="text-center text-sm text-slate-400 py-6">진행 중인 계약서가 없습니다.</p>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl flex justify-end">
                            <button
                                onClick={() => navigate(`/contracts?clientId=${activeContractsModalClientId}`)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                            >
                                <span>+</span> 새 계약 추가 / 목록 이동
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;

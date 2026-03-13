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
    telegramChatId?: string | null;
    telegramInviteCode?: string | null;
    telegramConnectedAt?: string | null;
    contractEndedAt?: string | null;
    contractStartDate?: string | null;
    contractEndDate?: string | null;
    contractFileDriveId?: string | null;
    contractFileName?: string | null;
}

interface ServiceContract {
    id: number;
    clientId: number;
    templateId: number;
    driveFolderId?: string | null;
    templateTitle?: string;
    templateDescription?: string | null;
    createdAt: string;
}

interface Template {
    id: number;
    title: string;
    description?: string | null;
}

const AdminPage = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [terminatedClients, setTerminatedClients] = useState<Client[]>([]); // 계약종료 거래처
    const [loading, setLoading] = useState(true);
    const [newClientName, setNewClientName] = useState('');
    const [newContractStartDate, setNewContractStartDate] = useState('');
    const [newContractEndDate, setNewContractEndDate] = useState('');
    const [contractFile, setContractFile] = useState<File | null>(null);
    const [creatingClient, setCreatingClient] = useState(false);
    const [syncingClients, setSyncingClients] = useState(false);

    // 탭 관리 및 병원 수정 상태
    const [activeTab, setActiveTab] = useState<'users' | 'clients' | 'terminated'>('users');
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [editingClientId, setEditingClientId] = useState<number | null>(null);
    const [editingClientName, setEditingClientName] = useState('');
    const [editingContractClientId, setEditingContractClientId] = useState<number | null>(null);
    const [editContractStart, setEditContractStart] = useState('');
    const [editContractEnd, setEditContractEnd] = useState('');
    const [editContractFile, setEditContractFile] = useState<File | null>(null);



    // 회원 리스트 정렬 상태
    const [userSortBy, setUserSortBy] = useState<'createdAtDesc' | 'createdAtAsc' | 'nameAsc' | 'role' | 'status'>('createdAtDesc');

    // ===== 계약 서비스 상태 =====
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [contractsMap, setContractsMap] = useState<Record<number, ServiceContract[]>>({});
    const [addingContractFor, setAddingContractFor] = useState<number | null>(null); // clientId
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]); // 다중 선택
    const [isAddingContract, setIsAddingContract] = useState(false); // 중복 클릭 방지

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
                result.data.forEach((c: Client) => fetchContracts(c.id));
            }
        } catch (err) {
            console.error('거래처 목록 불러오기 실패:', err);
        }
    };

    const fetchTerminatedClients = async () => {
        try {
            const response = await fetch('/api/clients?terminated=true', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) setTerminatedClients(result.data);
        } catch { /* ignore */ }
    };

    const fetchTemplates = async () => {
        try {
            const res = await fetch('/api/templates', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            setAllTemplates(Array.isArray(data) ? data : []);
        } catch { /* ignore */ }
    };

    const fetchContracts = async (clientId: number) => {
        try {
            const res = await fetch(`/api/client-contracts/${clientId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            if (data.success) {
                setContractsMap(prev => ({ ...prev, [clientId]: data.data }));
            }
        } catch { /* ignore */ }
    };

    const handleAddContract = async (clientId: number) => {
        if (selectedTemplateIds.length === 0 || isAddingContract) return;
        setIsAddingContract(true);
        let successCount = 0;
        let failMessages: string[] = [];
        try {
            // 선택한 템플릿을 순차적으로 등록
            for (const templateId of selectedTemplateIds) {
                const res = await fetch('/api/client-contracts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ clientId, templateId })
                });
                const data = await res.json();
                if (data.success) {
                    successCount++;
                } else {
                    failMessages.push(data.message || '등록 실패');
                }
            }

            if (successCount > 0) {
                toast.success(`섛비스 ${successCount}건이 계약 등록되었습니다.`);
            }
            if (failMessages.length > 0) {
                toast.error(failMessages.join('\n'));
            }
            setAddingContractFor(null);
            setSelectedTemplateIds([]);
            fetchContracts(clientId);
        } catch {
            toast.error('계약 추가 중 오류가 발생했습니다.');
        } finally {
            setIsAddingContract(false);
        }
    };

    const handleRemoveContract = async (contractId: number, clientId: number) => {
        if (!window.confirm('이 서비스 계약을 해제하시겠습니까? (드라이브 폴더는 유지됩니다)')) return;
        try {
            const res = await fetch(`/api/client-contracts/${contractId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                fetchContracts(clientId);
            } else {
                toast.error(data.message || '계약 해제 실패');
            }
        } catch {
            toast.error('계약 해제 중 오류가 발생했습니다.');
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
            const formData = new FormData();
            formData.append('name', newClientName.trim());
            if (newContractStartDate) formData.append('contractStartDate', newContractStartDate);
            if (newContractEndDate) formData.append('contractEndDate', newContractEndDate);
            if (contractFile) formData.append('contractFile', contractFile);

            const response = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData, // Content-Type: multipart/form-data 자동 설정
            });
            const result = await response.json();
            if (result.success) {
                const hasFile = !!contractFile;
                toast.success(`새 거래처 및 드라이브 폴더가 생성되었습니다.${hasFile ? ' 계약서 첨부 완료 📎' : ''}`);
                setNewClientName('');
                setNewContractStartDate('');
                setNewContractEndDate('');
                setContractFile(null);
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

    const handleUpdateContractInfo = async (client: Client) => {
        try {
            const formData = new FormData();
            if (editContractStart) formData.append('contractStartDate', editContractStart);
            if (editContractEnd) formData.append('contractEndDate', editContractEnd);
            if (editContractFile) formData.append('contractFile', editContractFile);
            const response = await fetch(`/api/clients/${client.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData,
            });
            const result = await response.json();
            if (result.success) {
                toast.success('계약 정보가 업데이트되었습니다.' + (editContractFile ? ' 📎 계약서 첨부 완료' : ''));
                setEditingContractClientId(null);
                setEditContractFile(null);
                fetchClients();
            } else {
                toast.error(result.message || '계약 정보 수정에 실패했습니다.');
            }
        } catch (err) {
            toast.error('수정 중 네트워크 오류가 발생했습니다.');
        }
    };



    const handleTelegramInvite = async (clientId: number) => {
        try {
            const response = await fetch(`/api/notification/telegram/invite/${clientId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                await navigator.clipboard.writeText(result.data.inviteUrl);
                toast.success('Telegram 초대 링크가 클립보드에 복사되었습니다!');
                fetchClients();
            } else {
                toast.error(result.message || '초대 링크 생성 실패');
            }
        } catch (err) {
            toast.error('초대 링크 생성 중 오류');
        }
    };

    const handleTerminateClient = async (client: Client) => {
        if (!window.confirm(`"​${client.name}"​ 거래처를 계약종료 처리하시걌습니까?\n\n• 활성 목록에서 숨겨집니다.\n• 구글 드라이브 폴더가 [계약종료] 폴더로 이동됩니다.`)) return;
        try {
            const res = await fetch(`/api/clients/${client.id}/terminate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                fetchClients();
                fetchTerminatedClients();
            } else {
                toast.error(data.message || '계약종료 실패');
            }
        } catch {
            toast.error('오류가 발생했습니다.');
        }
    };

    const handleDeleteClient = async (client: Client) => {
        if (!window.confirm(`⚠️ "${client.name}" 거래처를 완전히 삭제하시겠습니까?\n\n• 드라이브 폴더가 휴지통으로 이동됩니다.\n• 사이트에서 모든 자료가 삭제됩니다.\n\n이 작업은 되돌릴 수 없습니다.`)) return;
        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                fetchTerminatedClients();
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
        fetchTerminatedClients();
        fetchTemplates();
    }, []);;

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
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-black">{clients.length}</span>
                        {activeTab === 'clients' && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('terminated')}
                        className={`pb-4 px-2 text-[15px] font-bold transition-all relative ${activeTab === 'terminated' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        계약종료
                        {terminatedClients.length > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-black">{terminatedClients.length}</span>
                        )}
                        {activeTab === 'terminated' && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-rose-600 dark:bg-rose-400 rounded-t-full" />}
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
                ) : activeTab === 'clients' ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pt-2">

                        {/* 리스트 헤더 및 목록 새로고침 버튼 */}
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                등록된 병원 목록
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs px-2.5 py-0.5 rounded-full font-bold">{clients.length}</span>
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowRegisterModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                                >
                                    🏥 병원 등록
                                </button>
                                <a
                                    href="https://t.me/createtree_bot"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-xl text-sm font-bold transition-all"
                                >
                                    🤖 챗봇 등록하기
                                </a>
                                <button
                                    onClick={handleSyncClients}
                                    disabled={syncingClients}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                                >
                                    <span className={syncingClients ? "animate-spin" : ""}>🔄</span>
                                    {syncingClients ? "동기화 중..." : "구글 드라이브 목록 새로고침"}
                                </button>
                            </div>
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
                                                {/* 계약기간 */}
                                                {(client.contractStartDate || client.contractEndDate) && (
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[10px] font-bold text-slate-400">📅</span>
                                                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                            {client.contractStartDate || '?'} ~ {client.contractEndDate || '?'}
                                                        </span>
                                                    </div>
                                                )}
                                                {/* 계약서 첨부 여부 */}
                                                <div className="flex items-center justify-between">
                                                    {client.contractFileDriveId ? (
                                                        <a
                                                            href={`https://drive.google.com/file/d/${client.contractFileDriveId}/view`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-full text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                                                            title={client.contractFileName || '계약서'}
                                                        >
                                                            📎 계약서 첨부됨
                                                        </a>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 dark:text-slate-600">⚠️ 계약서 없음</span>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setEditingContractClientId(editingContractClientId === client.id ? null : client.id);
                                                            setEditContractStart(client.contractStartDate || '');
                                                            setEditContractEnd(client.contractEndDate || '');
                                                            setEditContractFile(null);
                                                        }}
                                                        className="text-[10px] font-bold text-slate-400 hover:text-blue-500 transition-colors"
                                                    >
                                                        {editingContractClientId === client.id ? '✕ 닫기' : '✏️ 수정'}
                                                    </button>
                                                </div>

                                                {/* 계약정보 수정 패널 */}
                                                {editingContractClientId === client.id && (
                                                    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col gap-2 animate-in fade-in duration-200">
                                                        <div className="flex items-center gap-1.5">
                                                            <input type="date" value={editContractStart} onChange={e => setEditContractStart(e.target.value)} className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                                            <span className="text-slate-400 text-xs font-bold">~</span>
                                                            <input type="date" value={editContractEnd} onChange={e => setEditContractEnd(e.target.value)} className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                                        </div>
                                                        <label className={`flex items-center gap-2 border border-dashed rounded-lg px-3 py-2 cursor-pointer transition-all ${editContractFile ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}>
                                                            <span className="text-sm">{editContractFile ? '📎' : '📂'}</span>
                                                            <span className="text-xs text-slate-500 truncate flex-1">{editContractFile ? editContractFile.name : '계약서 파일 첨부 (선택)'}</span>
                                                            {editContractFile && <button type="button" onClick={e => { e.preventDefault(); setEditContractFile(null); }} className="text-xs text-slate-400 hover:text-rose-500">✕</button>}
                                                            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.hwp,.xlsx,.xls,.png,.jpg" onChange={e => setEditContractFile(e.target.files?.[0] || null)} />
                                                        </label>
                                                        <button
                                                            onClick={() => handleUpdateContractInfo(client)}
                                                            className="w-full py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                                        >
                                                            저장
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ===== 계약 서비스 섹션 ===== */}

                                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="uppercase tracking-widest text-[9px] font-bold text-slate-400 dark:text-slate-500">계약 서비스</p>
                                                    {addingContractFor !== client.id && (
                                                        <button
                                                            onClick={() => { setAddingContractFor(client.id); setSelectedTemplateIds([]); }}
                                                            className="text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors"
                                                        >
                                                            + 추가
                                                        </button>
                                                    )}
                                                </div>
                                                {addingContractFor === client.id && (() => {
                                                    const available = allTemplates.filter(t =>
                                                        !(contractsMap[client.id] || []).some((c: ServiceContract) => c.templateId === t.id)
                                                    );
                                                    return (
                                                        <div className="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl animate-in fade-in slide-in-from-top-1 duration-150">
                                                            {available.length === 0 ? (
                                                                <p className="text-[10px] text-slate-400 text-center py-1">추가 가능한 서비스가 없습니다</p>
                                                            ) : (
                                                                <div className="space-y-1.5 mb-2.5">
                                                                    {available.map(t => (
                                                                        <label key={t.id} className="flex items-center gap-2 cursor-pointer group/item">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={selectedTemplateIds.includes(t.id)}
                                                                                onChange={e => {
                                                                                    setSelectedTemplateIds(prev =>
                                                                                        e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                                                                                    );
                                                                                }}
                                                                                className="w-3.5 h-3.5 rounded text-blue-600 border-blue-300 focus:ring-blue-400 cursor-pointer"
                                                                            />
                                                                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400 transition-colors">{t.title}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="flex gap-1.5">
                                                                <button
                                                                    onClick={() => handleAddContract(client.id)}
                                                                    disabled={selectedTemplateIds.length === 0 || isAddingContract}
                                                                    className="flex-1 py-1.5 text-[10px] font-bold bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
                                                                >
                                                                    {isAddingContract ? '등록 중...' : `등록하기 ${selectedTemplateIds.length > 0 ? `(${selectedTemplateIds.length}건)` : ''}`}
                                                                </button>
                                                                <button
                                                                    onClick={() => { setAddingContractFor(null); setSelectedTemplateIds([]); }}
                                                                    className="px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-600 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                                                                >
                                                                    취소
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                                                    {(contractsMap[client.id] || []).length === 0 ? (
                                                        <span className="text-[10px] text-slate-300 dark:text-slate-600 font-medium">계약된 서비스 없음</span>
                                                    ) : (
                                                        (contractsMap[client.id] || []).map((contract: ServiceContract) => (
                                                            <span
                                                                key={contract.id}
                                                                className="group/tag inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300 rounded-full text-[10px] font-bold"
                                                            >
                                                                {contract.driveFolderId ? '📁' : '⚠️'} {contract.templateTitle}
                                                                <button
                                                                    onClick={() => handleRemoveContract(contract.id, client.id)}
                                                                    className="opacity-0 group-hover/tag:opacity-100 text-indigo-400 hover:text-red-500 transition-all ml-0.5"
                                                                    title="계약 해제"
                                                                >
                                                                    ×
                                                                </button>
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                                                <p className="text-[11px] text-slate-400 font-medium break-all flex flex-col gap-1">
                                                    <span className="uppercase tracking-widest text-[9px] font-bold text-slate-300 dark:text-slate-600">Drive Sync ID</span>
                                                    <span className="font-mono text-slate-500">{client.driveFolderId || '폴더 연동 없음'}</span>
                                                </p>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                                                <p className="uppercase tracking-widest text-[9px] font-bold text-slate-300 dark:text-slate-600 mb-2">Telegram 알림</p>
                                                {client.telegramChatId ? (
                                                    <>
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
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`/연동 ${client.name}`);
                                                            toast.success('연동 명령어가 복사되었습니다! 텔레그램 그룹에 붙여넣기 하세요.');
                                                        }}
                                                        className="w-full py-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <span>📋</span> 연동 명령어 복사
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                    {/* ===== 계약종료 버튼 ===== */}
                                    <div className="mt-3 pt-3 border-t border-rose-100 dark:border-rose-900/30">
                                        <button
                                            onClick={() => handleTerminateClient(client)}
                                            className="w-full py-2 text-[10px] font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800/40 transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            🚫 계약 종료
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : activeTab === 'terminated' ? (
                    <div className="animate-in fade-in duration-300">
                        {terminatedClients.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-600">
                                <span className="text-5xl mb-4">✅</span>
                                <p className="font-bold text-lg">계약종료된 거래처가 없습니다</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                                {terminatedClients.map(client => (
                                    <div key={client.id} className="bento-card p-5 border border-rose-200 dark:border-rose-800/30 bg-rose-50/30 dark:bg-rose-900/10 opacity-80">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-lg">
                                                🚫
                                            </div>
                                            <h3 className="text-base font-black text-slate-700 dark:text-slate-300 line-through">{client.name}</h3>
                                        </div>
                                        <div className="mb-4 px-3 py-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                                            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-0.5">계약종료일</p>
                                            <p className="text-sm font-black text-rose-600 dark:text-rose-400">
                                                {client.contractEndedAt
                                                    ? new Date(client.contractEndedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                                                    : '-'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteClient(client)}
                                            className="w-full py-2 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/40 transition-colors"
                                        >
                                            🗑️ 거래처 완전 삭제
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* ===== 병원 등록 모달 ===== */}
            {showRegisterModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget) setShowRegisterModal(false); }}
                >
                    <div className="w-full max-w-md bg-white dark:bg-[hsl(var(--card))] rounded-2xl shadow-2xl border border-slate-200 dark:border-[hsl(var(--border))] animate-in fade-in zoom-in-95 duration-200">
                        {/* 모달 헤더 */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-0.5">신규 등록</p>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">🏥 병원(거래처) 등록</h2>
                            </div>
                            <button onClick={() => setShowRegisterModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition-colors font-bold text-lg">✕</button>
                        </div>

                        {/* 모달 본문 */}
                        <form onSubmit={handleCreateClient} className="p-6 flex flex-col gap-4">
                            <p className="text-xs text-slate-400 -mt-2">등록 시 구글 드라이브 내에 <strong className="text-blue-500">전용 폴더가 자동 생성</strong>되고 즉시 권한을 배정할 수 있습니다.</p>

                            {/* 병원명 */}
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

                            {/* 계약기간 */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">계약기간</span>
                                <div className="flex items-center gap-2">
                                    <input type="date" value={newContractStartDate} onChange={e => setNewContractStartDate(e.target.value)} className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                                    <span className="text-slate-400 font-bold">~</span>
                                    <input type="date" value={newContractEndDate} onChange={e => setNewContractEndDate(e.target.value)} className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                                </div>
                            </div>

                            {/* 계약서 파일 첨부 */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">계약서 첨부 (선택)</span>
                                <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all ${contractFile ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}>
                                    <span className="text-xl">{contractFile ? '📎' : '📂'}</span>
                                    <div className="flex-1 min-w-0">
                                        {contractFile
                                            ? <span className="text-sm font-bold text-blue-600 dark:text-blue-400 truncate block">{contractFile.name}</span>
                                            : <span className="text-sm text-slate-400">파일 클릭하여 업로드 (PDF, DOC, HWP 등)</span>
                                        }
                                    </div>
                                    {contractFile && <button type="button" onClick={e => { e.preventDefault(); setContractFile(null); }} className="text-xs text-slate-400 hover:text-rose-500 font-bold shrink-0">✕</button>}
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.hwp,.xlsx,.xls,.png,.jpg" onChange={e => setContractFile(e.target.files?.[0] || null)} />
                                </label>
                            </div>

                            {/* 버튼 */}
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowRegisterModal(false)} className="flex-1 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 transition-all">취소</button>
                                <button type="submit" disabled={creatingClient || !newClientName.trim()} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50">
                                    {creatingClient ? '생성 중...' : '등록 및 폴더 동기화'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;

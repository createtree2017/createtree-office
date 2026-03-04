import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ManualEditor from '../components/ManualEditor';
import CreateManualModal from '../components/CreateManualModal';
import { useModal } from '../contexts/ModalContext';
import toast from 'react-hot-toast';
import { ChevronRight, ChevronDown, Folder, FileText, Plus, Home, ChevronRight as ChevronRightIcon, MoreHorizontal, Trash2, Pencil } from 'lucide-react';

interface Manual {
    id: number;
    title: string;
    content: string;
    parentId: number | null;
    type: 'PAGE' | 'FOLDER';
    icon?: string;
    minRoleToEdit: string;
}

const ManualsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [manuals, setManuals] = useState<Manual[]>([]);
    const [currentManual, setCurrentManual] = useState<Manual | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
    const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null);
    const [renameId, setRenameId] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const contextMenuRef = useRef<HTMLDivElement>(null);

    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const roles = ["USER", "MANAGER", "ADMIN"];
    const canManage = user && (user.role === 'ADMIN' || user.role === 'MANAGER');

    const getToken = () => localStorage.getItem('token');

    const fetchManuals = async () => {
        try {
            const response = await fetch('/api/manuals', {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const result = await response.json();
            if (result.success) {
                setManuals(result.data);
            }
        } catch (err) {
            toast.error('목록을 불러오지 못했습니다.');
        }
    };

    const fetchDetail = async (manualId: string) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/manuals/${manualId}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const result = await response.json();
            if (result.success) {
                setCurrentManual(result.data);
            }
        } catch (err) {
            toast.error('상세 내용을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchManuals();
    }, []);

    useEffect(() => {
        if (id) {
            fetchDetail(id);
        } else {
            setLoading(false);
            setCurrentManual(null);
        }
    }, [id]);

    // 컨텍스트 메뉴 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSave = async (content: string) => {
        if (!id) return;
        const response = await fetch(`/api/manuals/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ content }),
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
    };

    const handleDelete = async (manualId: number) => {
        const target = manuals.find(m => m.id === manualId);
        if (!target) return;

        const isFolder = target.type === 'FOLDER';
        const confirmMsg = isFolder
            ? `"${target.title}" 폴더와 하위 항목을 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
            : `"${target.title}" 문서를 삭제하시겠습니까?`;

        if (!confirm(confirmMsg)) return;

        try {
            const response = await fetch(`/api/manuals/${manualId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const result = await response.json();
            if (result.success) {
                toast.success('삭제되었습니다.');
                await fetchManuals();
                // 현재 보고 있는 문서가 삭제된 경우 목록으로 이동
                if (id && parseInt(id) === manualId) {
                    navigate('/manuals');
                }
            } else {
                toast.error(result.message || '삭제에 실패했습니다.');
            }
        } catch (err) {
            toast.error('삭제 중 오류가 발생했습니다.');
        }
        setContextMenu(null);
    };

    const handleRenameStart = (manualId: number) => {
        const target = manuals.find(m => m.id === manualId);
        if (!target) return;
        setRenameId(manualId);
        setRenameValue(target.title);
        setContextMenu(null);
    };

    const handleRenameSubmit = async (manualId: number) => {
        if (!renameValue.trim()) {
            setRenameId(null);
            return;
        }
        try {
            const response = await fetch(`/api/manuals/${manualId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ title: renameValue.trim() }),
            });
            const result = await response.json();
            if (result.success) {
                toast.success('이름이 변경되었습니다.');
                await fetchManuals();
                // 현재 보고 있는 문서인 경우 업데이트
                if (currentManual && currentManual.id === manualId) {
                    setCurrentManual({ ...currentManual, title: renameValue.trim() });
                }
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            toast.error('이름 변경에 실패했습니다.');
        }
        setRenameId(null);
    };

    const toggleFolder = (folderId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
        } else {
            newExpanded.add(folderId);
        }
        setExpandedFolders(newExpanded);
    };

    // 트리 구조 생성 로직
    const manualTree = useMemo(() => {
        const buildTree = (pId: number | null = null): (Manual & { children: any[] })[] => {
            return manuals
                .filter(m => m.parentId === pId)
                .map(m => ({
                    ...m,
                    children: buildTree(m.id)
                }));
        };
        return buildTree(null);
    }, [manuals]);

    // 브레드크럼 생성 로직
    const breadcrumbs = useMemo(() => {
        if (!currentManual) return [];
        const path: Manual[] = [];
        let curr: Manual | undefined = currentManual;
        while (curr) {
            path.unshift(curr);
            const pid: number | null = curr.parentId;
            curr = manuals.find(m => m.id === pid);
        }
        return path;
    }, [currentManual, manuals]);

    const { openModal } = useModal();

    const handleCreateClick = (parentId: number | null = null) => {
        openModal(<CreateManualModal onSuccess={fetchManuals} initialParentId={parentId} />);
    };

    const renderTreeItem = (item: Manual & { children: any[] }, level: number = 0) => {
        const isSelected = parseInt(id || '0') === item.id;
        const isExpanded = expandedFolders.has(item.id);
        const isRenaming = renameId === item.id;

        return (
            <div key={item.id} className="select-none">
                <div
                    onClick={() => {
                        if (isRenaming) return;
                        item.type === 'PAGE' ? navigate(`/manuals/${item.id}`) : toggleFolder(item.id, { stopPropagation: () => { } } as any);
                    }}
                    className={`group flex items-center py-1.5 px-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm border border-blue-100' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-transparent'
                        }`}
                    style={{ marginLeft: `${level * 12}px` }}
                >
                    <span className="w-5 h-5 mr-1 flex items-center justify-center">
                        {item.type === 'FOLDER' && (
                            <button onClick={(e) => toggleFolder(item.id, e)} className="p-0.5 hover:bg-white hover:shadow-sm rounded transition-colors text-slate-400">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                        )}
                    </span>
                    <span className="mr-2.5 flex items-center justify-center w-5 h-5">
                        {item.icon ? (
                            <span className="text-base">{item.icon}</span>
                        ) : (
                            item.type === 'FOLDER' ? <Folder size={16} className="text-blue-500/60" /> : <FileText size={16} className="text-slate-400" />
                        )}
                    </span>

                    {isRenaming ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameSubmit(item.id)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameSubmit(item.id);
                                if (e.key === 'Escape') setRenameId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 text-[13px] bg-white border border-blue-400 rounded px-1 py-0 outline-none text-slate-900"
                        />
                    ) : (
                        <span className="flex-1 truncate text-[13px]">
                            {item.title}
                        </span>
                    )}

                    {/* CRUD 버튼들 (hover 시 표시) */}
                    {canManage && !isRenaming && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                            {item.type === 'FOLDER' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleCreateClick(item.id); }}
                                    className="p-1 hover:bg-white hover:shadow-sm rounded-lg text-slate-400 hover:text-blue-600 transition-all border border-transparent hover:border-slate-100"
                                    title="하위 항목 추가"
                                >
                                    <Plus size={13} />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                    setContextMenu({ id: item.id, x: rect.right, y: rect.bottom });
                                }}
                                className="p-1 hover:bg-white hover:shadow-sm rounded-lg text-slate-400 hover:text-slate-700 transition-all border border-transparent hover:border-slate-100"
                                title="더보기"
                            >
                                <MoreHorizontal size={13} />
                            </button>
                        </div>
                    )}
                </div>
                {item.type === 'FOLDER' && isExpanded && (
                    <div className="mt-0.5">
                        {item.children.map(child => renderTreeItem(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    const canEdit = currentManual && user && roles.indexOf(user.role) >= roles.indexOf(currentManual.minRoleToEdit);

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex">
            {/* Sidebar */}
            <div className="w-72 glass-sidebar p-5 flex flex-col h-screen sticky top-0">
                <div className="flex items-center justify-between mb-8 px-2">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">CT</div>
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">createTree</h2>
                    </div>
                    {canManage && (
                        <button
                            onClick={() => handleCreateClick(null)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-all cursor-pointer border border-slate-200"
                            title="새 페이지/폴더"
                        >
                            <Plus size={18} />
                        </button>
                    )}
                </div>

                <div className="space-y-0.5 overflow-y-auto flex-1 custom-scrollbar pr-2">
                    {manualTree.map(item => renderTreeItem(item))}
                    {manuals.length === 0 && !loading && (
                        <div className="text-center py-10 px-4">
                            <p className="text-slate-400 text-sm">표시할 문서가 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Context Menu (우클릭/더보기 드롭다운) */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[140px]"
                    style={{ top: contextMenu.y + 4, left: contextMenu.x - 140 }}
                >
                    <button
                        onClick={() => handleRenameStart(contextMenu.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                    >
                        <Pencil size={14} />
                        이름 바꾸기
                    </button>
                    <hr className="my-1 border-slate-100" />
                    <button
                        onClick={() => handleDelete(contextMenu.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                        <Trash2 size={14} />
                        삭제
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 min-h-screen flex flex-col">
                {/* Header/Breadcrumbs */}
                <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center gap-2 text-sm text-slate-500 shadow-sm">
                    <div
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        onClick={() => navigate('/manuals')}
                    >
                        <Home size={16} />
                    </div>
                    {breadcrumbs.map((crumb, index) => (
                        <React.Fragment key={crumb.id}>
                            <ChevronRightIcon size={14} className="text-slate-300" />
                            <span
                                className={`px-2 py-1 rounded-md cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-all ${index === breadcrumbs.length - 1 ? 'text-slate-900 font-semibold bg-slate-50 border border-slate-200 shadow-sm' : ''}`}
                                onClick={() => navigate(`/manuals/${crumb.id}`)}
                            >
                                {crumb.title}
                            </span>
                        </React.Fragment>
                    ))}

                    {/* 현재 문서 액션 버튼들 */}
                    {currentManual && canManage && (
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={() => handleRenameStart(currentManual.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-all border border-slate-200"
                            >
                                <Pencil size={12} />
                                이름 변경
                            </button>
                            <button
                                onClick={() => handleDelete(currentManual.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-slate-200"
                            >
                                <Trash2 size={12} />
                                삭제
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-8 lg:p-12 max-w-5xl mx-auto w-full">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400 gap-4">
                            <div className="w-12 h-12 border-4 border-blue-600/10 border-t-blue-600 rounded-full animate-spin"></div>
                            <p className="font-medium animate-pulse">내용을 불러오는 중...</p>
                        </div>
                    ) : currentManual ? (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-5 mb-10">
                                <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-4xl shadow-sm">
                                    {currentManual.icon || (currentManual.type === 'FOLDER' ? '📁' : '📝')}
                                </div>
                                <div>
                                    <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-1">
                                        {currentManual.title}
                                    </h1>
                                    <p className="text-slate-500 font-medium">
                                        {canEdit ? '편집 가능' : '관리자/매니저 편집 가능'}
                                    </p>
                                </div>
                            </div>

                            <div className="bento-card p-6 md:p-10 min-h-[600px]">
                                <ManualEditor
                                    initialContent={currentManual.content}
                                    onSave={handleSave}
                                    editable={!!canEdit}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center min-h-[70vh] text-slate-400">
                            <div className="w-24 h-24 bg-white border border-slate-200 rounded-3xl mb-8 flex items-center justify-center shadow-sm">
                                <FileText size={48} className="text-slate-200" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-2 font-mono tracking-tight">DOCUMENT SELECTOR</h3>
                            <p className="max-w-sm text-center leading-relaxed">
                                사이드바에서 탐색할 매뉴얼을 선택하거나,<br />
                                새로운 지식 베이스를 구축해 보세요.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManualsPage;

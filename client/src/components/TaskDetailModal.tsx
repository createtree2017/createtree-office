import React from 'react';
import { useModal } from '../contexts/useModal';
import { useNavigate } from 'react-router-dom';
import { Calendar, User, Clock, Trash2, Edit3, X } from 'lucide-react';
import CreateTaskModal from './CreateTaskModal';
import toast from 'react-hot-toast';

interface Task {
    id: number;
    title: string;
    description: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
    dueDate: string | null;
    assigneeId: number;
    authorId: number;
    assigneeName: string;
    templateId?: number | null;
    templateTitle?: string | null;
    clientId?: number | null;
    clientName?: string | null;
    driveFolderId?: string | null;
}

interface TaskDetailModalProps {
    task: Task;
    onSuccess: () => void;
}

const TaskDetailModal = ({ task, onSuccess }: TaskDetailModalProps) => {
    const { openModal, closeModal } = useModal();
    const navigate = useNavigate();

    const handleEdit = () => {
        openModal(<CreateTaskModal initialData={task} onSuccess={onSuccess} />);
    };

    const handleDelete = async () => {
        const hasProgress = task.status === 'IN_PROGRESS' || task.status === 'COMPLETED';
        const confirmMsg = hasProgress
            ? `이 업무에 진행 중인 작성 내용이 있습니다.\n삭제하면 모든 작성 내용도 함께 삭제됩니다.\n\n정말 삭제하시겠습니까?`
            : '정말로 이 업무를 삭제하시겠습니까?';

        if (!confirm(confirmMsg)) return;

        try {
            const response = await fetch(`/api/tasks/${task.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const result = await response.json();
            if (result.success) {
                toast.success('업무가 삭제되었습니다.');
                onSuccess();
                closeModal();
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            toast.error('삭제 중 오류가 발생했습니다.');
        }
    };



    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PENDING': return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
            case 'IN_PROGRESS': return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
            case 'ON_HOLD': return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
            case 'COMPLETED': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
            default: return '';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'PENDING': return '대기 중';
            case 'IN_PROGRESS': return '진행 중';
            case 'ON_HOLD': return '보류 중';
            case 'COMPLETED': return '완료됨';
            default: return '';
        }
    };

    return (
        <div className="relative bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-2xl">
            {/* Header with Background Accent */}
            <div className="h-28 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center px-8 relative">
                <div className={`px-4 py-1.5 rounded-full text-[13px] tracking-wide font-extrabold border shadow-sm ${getStatusColor(task.status)}`}>
                    {getStatusText(task.status)}
                </div>
                <button onClick={closeModal} className="ml-auto p-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-2xl transition-all cursor-pointer">
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="p-8 md:p-10">
                <h2 className="text-3xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-4 leading-tight tracking-tight">
                    {task.title}
                </h2>
                
                <div className="mb-6 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50">
                        🏢 {task.clientName || '내부업무'}
                    </span>
                    {task.templateTitle && (
                        <>
                            <span className="text-slate-300 dark:text-slate-600 font-light">|</span>
                            <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                                📝 {task.templateTitle}
                            </span>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap gap-2.5 mb-10">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[13px] bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50 font-semibold">
                        <User className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        <span>담당: <span className="text-slate-900 dark:text-slate-200">{task.assigneeName}</span></span>
                    </div>
                    {task.dueDate && (
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[13px] bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50 font-semibold">
                            <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                            <span>마감: <span className="text-slate-900 dark:text-slate-200">{new Date(task.dueDate).toLocaleDateString()}</span></span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[13px] bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50 font-semibold">
                        <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        <span>생성: <span className="text-slate-900 dark:text-slate-200">{new Date().toLocaleDateString()}</span></span>
                    </div>
                </div>

                <div className="mb-12">
                    <h3 className="text-slate-400 dark:text-slate-500 text-[11px] font-bold uppercase tracking-[0.2em] mb-4 ml-1">요약 내용</h3>
                    <div className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/50 p-8 rounded-2xl text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap min-h-[160px] text-[15px] font-medium">
                        {task.description || "요약 설명이 없습니다."}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between pt-8 border-t border-slate-100 dark:border-slate-800 gap-4">
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 px-6 py-4 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-2xl transition-all font-bold group cursor-pointer"
                    >
                        <Trash2 className="w-5 h-5 group-hover:animate-bounce" />
                        Delete Task
                    </button>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleEdit}
                            className="flex items-center gap-2 px-8 py-4 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-2xl transition-all font-bold shadow-xl shadow-slate-200 dark:shadow-none cursor-pointer active:scale-95"
                        >
                            <Edit3 className="w-5 h-5" />
                            Edit Task
                        </button>
                        {task.templateId && (
                            <button
                                onClick={() => {
                                    closeModal();
                                    navigate(`/tasks/${task.id}/response`);
                                }}
                                className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-2xl transition-all font-bold shadow-xl shadow-emerald-500/30 dark:shadow-none cursor-pointer active:scale-95"
                            >
                                <Calendar className="w-5 h-5" />
                                폼 작성하기
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskDetailModal;

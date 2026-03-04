import React from 'react';
import { useModal } from '../contexts/ModalContext';
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
}

interface TaskDetailModalProps {
    task: Task;
    onSuccess: () => void;
}

const TaskDetailModal = ({ task, onSuccess }: TaskDetailModalProps) => {
    const { openModal, closeModal } = useModal();

    const handleEdit = () => {
        openModal(<CreateTaskModal initialData={task} onSuccess={onSuccess} />);
    };

    const handleDelete = async () => {
        if (!confirm('정말로 이 업무를 삭제하시겠습니까?')) return;

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
            case 'PENDING': return 'bg-slate-800 text-slate-400 border-slate-700';
            case 'IN_PROGRESS': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'ON_HOLD': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            case 'COMPLETED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
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
        <div className="relative bg-white dark:bg-[hsl(var(--card))] rounded-3xl overflow-hidden">
            {/* Header with Background Accent */}
            <div className="h-28 bg-slate-50 border-b border-slate-100 flex items-center px-8">
                <div className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 shadow-sm ${getStatusColor(task.status)}`}>
                    {getStatusText(task.status)}
                </div>
                <button onClick={closeModal} className="ml-auto p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="p-8 md:p-10">
                <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-6 leading-tight tracking-tight">
                    {task.title}
                </h2>

                <div className="flex flex-wrap gap-3 mb-10">
                    <div className="flex items-center gap-2 text-slate-500 text-[13px] bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-semibold">
                        <User className="w-4 h-4 text-blue-500" />
                        <span>담당: <span className="text-slate-900">{task.assigneeName}</span></span>
                    </div>
                    {task.dueDate && (
                        <div className="flex items-center gap-2 text-slate-500 text-[13px] bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-semibold">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            <span>마감: <span className="text-slate-900">{new Date(task.dueDate).toLocaleDateString()}</span></span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-500 text-[13px] bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-semibold">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span>생성: <span className="text-slate-900">{new Date().toLocaleDateString()}</span></span>
                    </div>
                </div>

                <div className="mb-12">
                    <h3 className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.2em] mb-4 ml-1">상세 내용</h3>
                    <div className="bg-slate-50/50 border border-slate-100 p-8 rounded-2xl text-slate-600 leading-relaxed whitespace-pre-wrap min-h-[160px] text-[15px] font-medium">
                        {task.description || "상세 설명이 없습니다."}
                    </div>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-slate-100 gap-4">
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 px-6 py-4 text-rose-500 hover:bg-rose-50 rounded-2xl transition-all font-bold group"
                    >
                        <Trash2 className="w-5 h-5 group-hover:animate-bounce" />
                        Delete Task
                    </button>

                    <button
                        onClick={handleEdit}
                        className="flex items-center gap-2 px-10 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl transition-all font-bold shadow-xl shadow-slate-200 active:scale-95"
                    >
                        <Edit3 className="w-5 h-5" />
                        Edit Task
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TaskDetailModal;

import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { X, GripVertical, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useModal } from '../contexts/useModal';

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
    sortOrder?: number;
}

interface ExpandedColumnModalProps {
    status: string;
    label: string;
    icon: React.ReactNode;
    tasks: Task[];
    dotClass: string;
    headerClass: string;
    handleTaskClick: (task: Task) => void;
    fetchTasks: () => void;
    selectedClientId: number | 'ALL';
}

export default function ExpandedColumnModal({
    status,
    label,
    icon,
    tasks,
    dotClass,
    headerClass,
    handleTaskClick,
    fetchTasks,
    selectedClientId
}: ExpandedColumnModalProps) {
    const { closeModal } = useModal();
    const [localTasks, setLocalTasks] = useState(tasks);

    const onDragEnd = async (result: DropResult) => {
        const { destination, source } = result;
        if (!destination) return;
        if (destination.index === source.index) return;
        
        if (selectedClientId !== 'ALL') {
             toast.error('거래처 필터가 적용된 상태에서는 순서를 변경할 수 없습니다.\n전체 보기 상태에서 이용해 주세요.', { duration: 4000 });
             return;
        }

        const previousTasks = [...localTasks];
        const newTasks = Array.from(localTasks);
        
        const [removed] = newTasks.splice(source.index, 1);
        newTasks.splice(destination.index, 0, removed);

        // Update local state optimisticially
        const updatedTasks = newTasks.map((t, index) => ({
            ...t,
            sortOrder: index
        }));
        
        setLocalTasks(updatedTasks);

        const updates = updatedTasks.map(t => ({ id: t.id, status: t.status, sortOrder: t.sortOrder }));

        try {
            const response = await fetch('/api/tasks/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ updates }),
            });
            const resData = await response.json();
            if (resData.success) {
                // 부모 컴포넌트 데이터도 리프레시
                fetchTasks();
            } else {
                toast.error(resData.message || '상태 변경 권한이 없습니다.');
                setLocalTasks(previousTasks);
            }
        } catch {
            toast.error('순서 변경 중 네트워크 오류가 발생했습니다.');
            setLocalTasks(previousTasks);
        }
    };

    return (
        <div className="flex flex-col h-[85vh] p-2 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className={`flex items-center justify-between pb-4 border-b-2 mb-4 px-4 ${headerClass}`}>
                <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${dotClass}`}></span>
                    <span className="text-xl font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        {icon} {label}
                    </span>
                    <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg text-sm font-bold ml-2">
                        전체 {localTasks.length}건
                    </span>
                </div>
                <button
                    onClick={closeModal}
                    className="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white bg-transparent hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors flex-shrink-0"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 select-none">
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId={`expanded_${status}`}>
                        {(provided, snapshot) => (
                            <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`flex flex-col gap-3 min-h-[200px] p-2 rounded-2xl transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-slate-100 dark:bg-slate-800/50 ring-2 ring-blue-500/30' : ''}`}
                            >
                                {localTasks.map((task, index) => (
                                    <Draggable key={`ext_${task.id}`} draggableId={`ext_${task.id}`} index={index}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                // 여기 클릭 이벤트를 통해 TasksPage 내의 개별 모달을 호출합니다. 호출 시 자동으로 이 모달은 닫힙니다.
                                                onClick={() => handleTaskClick(task)}
                                                className={`group cursor-pointer rounded-xl p-4 transition-all duration-200
                                                    border-2 bg-white dark:bg-[hsl(var(--card))]
                                                    ${snapshot.isDragging
                                                        ? 'border-blue-500 shadow-2xl shadow-blue-500/20 scale-[1.02] z-50'
                                                        : 'border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm hover:shadow-md dark:shadow-black/30'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors pr-4">
                                                        {task.title}
                                                    </h3>
                                                    <GripVertical className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 w-5 h-5 flex-shrink-0 transition-opacity" />
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    {(task.clientId || task.templateId) && (
                                                        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-800/50 shadow-[2px_2px_0px_#e2e8f0] dark:shadow-[2px_2px_0px_#334155]">
                                                            {task.clientId && (
                                                                <span className="px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 tracking-wide border-r border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                                                                    {task.clientName || '내부업무'}
                                                                </span>
                                                            )}
                                                            {task.templateId && (
                                                                <span className="px-2 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20">
                                                                    {task.templateTitle}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex justify-between items-end mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                                                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-md">
                                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-tighter">
                                                            {task.assigneeName.charAt(0)}
                                                        </span>
                                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 truncate max-w-[80px]">
                                                            {task.assigneeName}
                                                        </span>
                                                    </div>
                                                    {task.dueDate && (
                                                        <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                                            <Clock size={12} />
                                                            {task.dueDate.split('T')[0]}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            </div>
        </div>
    );
}

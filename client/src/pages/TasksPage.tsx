import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useModal } from '../contexts/ModalContext';
import CreateTaskModal from '../components/CreateTaskModal';
import TaskDetailModal from '../components/TaskDetailModal';
import toast from 'react-hot-toast';
import { Plus, CheckCircle2, Clock, PauseCircle, AlertCircle } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

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

const TasksPage = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'calendar'>('list');
    const { openModal } = useModal();

    const fetchTasks = async () => {
        try {
            const response = await fetch('/api/tasks', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                setTasks(result.data);
            }
        } catch (err) {
            toast.error('업무 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleCreateTask = () => {
        openModal(<CreateTaskModal onSuccess={fetchTasks} />);
    };

    const handleTaskClick = (task: Task) => {
        openModal(<TaskDetailModal task={task} onSuccess={fetchTasks} />);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'PENDING': return <AlertCircle className="w-4 h-4 text-slate-400" />;
            case 'IN_PROGRESS': return <Clock className="w-4 h-4 text-blue-400" />;
            case 'ON_HOLD': return <PauseCircle className="w-4 h-4 text-amber-400" />;
            case 'COMPLETED': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
            default: return null;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'PENDING': return '대기';
            case 'IN_PROGRESS': return '진행';
            case 'ON_HOLD': return '보류';
            case 'COMPLETED': return '완료';
        }
    };

    const onDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        const taskId = parseInt(draggableId);
        const newStatus = destination.droppableId as Task['status'];

        // Optimistic UI update
        const previousTasks = [...tasks];
        setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            const resData = await response.json();
            if (!resData.success) {
                toast.error(resData.message || '상태 변경 권한이 없습니다.');
                setTasks(previousTasks); // Revert
            } else {
                toast.success(`상태가 ${getStatusText(newStatus)}(으)로 변경되었습니다.`);
            }
        } catch (err) {
            toast.error('상태 변경 중 오류가 발생했습니다.');
            setTasks(previousTasks); // Revert
        }
    };

    const renderListView = () => {
        const statuses: Task['status'][] = ['PENDING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'];
        return (
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {statuses.map(status => (
                        <div key={status} className="flex flex-col gap-5">
                            <h3 className="text-[13px] font-bold text-slate-400 uppercase tracking-[0.1em] flex items-center gap-2 px-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                {getStatusText(status)}
                                <span className="ml-auto bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-[10px] border border-slate-200">{tasks.filter(t => t.status === status).length}</span>
                            </h3>
                            <Droppable droppableId={status}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`space-y-4 min-h-[500px] p-2 rounded-2xl transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-blue-50/50 ring-2 ring-blue-500/10' : ''}`}
                                    >
                                        {tasks.filter(t => t.status === status).map((task, index) => (
                                            <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        onClick={() => handleTaskClick(task)}
                                                        className={`bento-card p-5 group cursor-pointer 
                                                            ${snapshot.isDragging ? 'border-blue-500 shadow-2xl scale-[1.03] z-50 bg-white ring-4 ring-blue-500/5' : 'border-slate-200'}`}
                                                        style={{ ...provided.draggableProps.style }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3 mb-3">
                                                            <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">{task.title}</h4>
                                                            <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400 group-hover:text-blue-500 transition-colors">
                                                                {getStatusIcon(status)}
                                                            </div>
                                                        </div>
                                                        <p className="text-[13px] text-slate-500 line-clamp-2 mb-4 leading-relaxed break-words font-medium">{task.description}</p>
                                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 border border-blue-200">
                                                                    {task.assigneeName.charAt(0)}
                                                                </div>
                                                                <span className="text-[11px] font-semibold text-slate-600">{task.assigneeName}</span>
                                                            </div>
                                                            {task.dueDate && (
                                                                <div className="flex items-center gap-1.5 text-slate-400">
                                                                    <Clock size={12} />
                                                                    <span className="text-[10px] font-medium">{new Date(task.dueDate).toLocaleDateString()}</span>
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
                        </div>
                    ))}
                </div>
            </DragDropContext>
        );
    };

    const onCalendarDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId) return;

        const taskId = parseInt(draggableId);
        // droppableId is like "cal_1709424000000"
        const newTimestamp = parseInt(destination.droppableId.split('_')[1]);
        const newDate = new Date(newTimestamp);
        // Adjust timezone offset to be safe
        const formattedDate = newDate.toISOString().split('T')[0] + 'T23:59:59Z'; // Set end of day

        const previousTasks = [...tasks];
        setTasks(tasks.map(t => t.id === taskId ? { ...t, dueDate: formattedDate } : t));

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ dueDate: formattedDate })
            });
            const resData = await response.json();
            if (!resData.success) {
                toast.error(resData.message || '수정 권한이 없습니다.');
                setTasks(previousTasks);
            } else {
                toast.success('마감일이 연기/변경 되었습니다.');
            }
        } catch (err) {
            toast.error('오류가 발생했습니다.');
            setTasks(previousTasks);
        }
    };

    const renderCalendarView = () => (
        <div className="bento-card p-6 md:p-10 calendar-container">
            <DragDropContext onDragEnd={onCalendarDragEnd}>
                <Calendar
                    className="w-full bg-transparent border-none"
                    tileContent={({ date }: { date: Date }) => {
                        const dayTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === date.toDateString());
                        return (
                            <Droppable droppableId={`cal_${date.getTime()}`}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex flex-col gap-1.5 mt-2 w-full flex-grow min-h-[60px] rounded-xl p-1.5 transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-blue-50/50 ring-2 ring-blue-500/20' : ''}`}
                                    >
                                        {dayTasks.map((t, index) => (
                                            <Draggable key={`cal_task_${t.id}`} draggableId={t.id.toString()} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        onClick={(e) => { e.stopPropagation(); handleTaskClick(t); }}
                                                        className={`text-[10px] font-bold px-2 py-1.5 rounded-lg select-none cursor-pointer truncate transition-all border
                                                            ${snapshot.isDragging ? 'bg-blue-600 text-white shadow-2xl scale-110 z-50 border-blue-400' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:bg-white shadow-sm'}`}
                                                        title={t.title}
                                                    >
                                                        {t.title}
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        );
                    }}
                />
            </DragDropContext>
            <style>{`
        .react-calendar { width: 100% !important; background: transparent; border: none; font-family: inherit; }
        .react-calendar__tile { color: #475569; padding: 1em !important; height: 160px; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; border: 1px solid #f1f5f9 !important; overflow: hidden; transition: all 0.2s; background: white; }
        .react-calendar__tile:enabled:hover, .react-calendar__tile:enabled:focus { background-color: #f8fafc; border-color: #3b82f640 !important; }
        .react-calendar__tile--now { background: #eff6ff !important; border-color: #3b82f630 !important; }
        .react-calendar__tile--now abbr { font-weight: 800; color: #3b82f6; background: white; padding: 4px 10px; border-radius: 99px; shadow-sm; border: 1px solid #3b82f620; }
        .react-calendar__tile--active { background: #f1f5f9 !important; color: #1e293b !important; border: 1px solid #cbd5e1 !important; }
        .react-calendar__tile--active:enabled:hover { background: #e2e8f0 !important; }
        .react-calendar__navigation { margin-bottom: 2rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 1rem; }
        .react-calendar__navigation button { color: #0f172a; font-size: 1.1rem; font-weight: 700; min-width: 44px; background: none; transition: all 0.2s; border-radius: 12px; }
        .react-calendar__navigation button:enabled:hover, .react-calendar__navigation button:enabled:focus { background-color: #f1f5f9; }
        .react-calendar__month-view__weekdays { text-transform: uppercase; font-weight: 800; font-size: 0.7rem; color: #94a3b8; margin-bottom: 1rem; text-align: center; }
        .react-calendar__month-view__weekdays__weekday abbr { text-decoration: none; }
        .react-calendar__month-view__days__day--neighboringMonth { color: #e2e8f0; }
        .react-calendar__month-view__days__day--weekend { color: #f43f5e; }
      `}</style>
        </div>
    );

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-6 pt-20 md:p-10 md:pt-20 lg:p-12 lg:pt-20 font-sans">
            <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-8">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            Collaborative Workspace
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">Tasks Management</h1>
                        <p className="text-slate-500 mt-3 font-medium text-lg max-w-lg">팀의 생산성을 높이고 실시간으로 업무 진행 상황을 추적하세요.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <div className="bg-white p-1 rounded-2xl border border-slate-200 flex shadow-sm">
                            <button
                                onClick={() => setView('list')}
                                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                            >
                                Kanban
                            </button>
                            <button
                                onClick={() => setView('calendar')}
                                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'calendar' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                            >
                                Calendar
                            </button>
                        </div>

                        <button
                            onClick={handleCreateTask}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl flex items-center gap-2 font-bold shadow-xl shadow-slate-200 transition-all cursor-pointer active:scale-95"
                        >
                            <Plus className="w-5 h-5 shadow-sm" />
                            New Task
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-400">
                        <div className="w-14 h-14 border-4 border-blue-600/10 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                        <div className="font-bold tracking-tight animate-pulse text-lg">LOADING WORKSPACE...</div>
                    </div>
                ) : view === 'list' ? renderListView() : renderCalendarView()}
            </div>
        </div>
    );
};

export default TasksPage;

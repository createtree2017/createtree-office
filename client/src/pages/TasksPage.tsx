import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useModal } from '../contexts/ModalContext';
import CreateTaskModal from '../components/CreateTaskModal';
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
        openModal(<CreateTaskModal initialData={task} onSuccess={fetchTasks} />);
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {statuses.map(status => (
                        <div key={status} className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 px-2">
                                {getStatusIcon(status)}
                                {getStatusText(status)}
                                <span className="ml-auto bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">{tasks.filter(t => t.status === status).length}</span>
                            </h3>
                            <Droppable droppableId={status}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`space-y-3 min-h-[300px] p-2 rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-slate-800/80 ring-2 ring-emerald-500/30' : ''}`}
                                    >
                                        {tasks.filter(t => t.status === status).map((task, index) => (
                                            <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        onClick={() => handleTaskClick(task)}
                                                        className={`bg-slate-900 border p-4 rounded-xl transition-all cursor-pointer group shadow-lg
                                                            ${snapshot.isDragging ? 'border-emerald-500/80 shadow-2xl scale-105 z-50 bg-slate-800' : 'border-slate-800 hover:border-slate-600'}`}
                                                        style={{ ...provided.draggableProps.style }}
                                                    >
                                                        <h4 className="font-bold text-white group-hover:text-emerald-400 transition-colors mb-2">{task.title}</h4>
                                                        <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed break-words">{task.description}</p>
                                                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800/50">
                                                            <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded-md text-slate-400">{task.assigneeName}</span>
                                                            {task.dueDate && (
                                                                <span className="text-[10px] text-slate-500">{new Date(task.dueDate).toLocaleDateString()}</span>
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl calendar-container">
            <DragDropContext onDragEnd={onCalendarDragEnd}>
                <Calendar
                    className="w-full bg-transparent border-none text-white"
                    tileContent={({ date }: { date: Date }) => {
                        const dayTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === date.toDateString());
                        return (
                            <Droppable droppableId={`cal_${date.getTime()}`}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex flex-col gap-1 mt-1 w-full flex-grow min-h-[40px] rounded p-1 transition-colors ${snapshot.isDraggingOver ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50' : ''}`}
                                    >
                                        {dayTasks.map((t, index) => (
                                            <Draggable key={`cal_task_${t.id}`} draggableId={t.id.toString()} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        onClick={(e) => { e.stopPropagation(); handleTaskClick(t); }}
                                                        className={`text-[10px] sm:text-xs font-medium px-2 py-1 rounded select-none cursor-pointer truncate transition-all 
                                                            ${snapshot.isDragging ? 'bg-emerald-500 text-white shadow-xl scale-110 z-50' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
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
        .react-calendar__tile { color: white; padding: 0.5em !important; height: 120px; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; border: 1px solid #1e293b !important; overflow: hidden; }
        .react-calendar__tile:enabled:hover, .react-calendar__tile:enabled:focus { background-color: #0f172a; }
        .react-calendar__tile--now { background: #1e293b !important; }
        .react-calendar__tile--now abbr { font-weight: bold; color: #38bdf8; background: #38bdf820; padding: 2px 6px; border-radius: 999px; }
        .react-calendar__tile--active { background: #10b98110 !important; color: inherit !important; border: 1px solid #10b98130 !important; }
        .react-calendar__tile--active:enabled:hover { background: #10b98120 !important; }
        .react-calendar__tile--hasActive { background: transparent !important; }
        .react-calendar__navigation button { color: white; font-size: 1.2rem; min-width: 44px; background: none; }
        .react-calendar__navigation button:enabled:hover, .react-calendar__navigation button:enabled:focus { background-color: #1e293b; border-radius: 8px; }
        .react-calendar__month-view__weekdays { text-transform: uppercase; font-weight: bold; font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; text-align: center; }
        .react-calendar__month-view__weekdays__weekday abbr { text-decoration: none; }
        .react-calendar__month-view__days__day--neighboringMonth { color: #334155; }
      `}</style>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-white p-8 md:p-12 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
                    <div>
                        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Tasks Management</h1>
                        <p className="text-slate-500 mt-2">부여된 업무를 추적하고 협업하세요.</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex">
                            <button
                                onClick={() => setView('list')}
                                className={`px-4 py-2 rounded-lg text-sm transition-all ${view === 'list' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Board
                            </button>
                            <button
                                onClick={() => setView('calendar')}
                                className={`px-4 py-2 rounded-lg text-sm transition-all ${view === 'calendar' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Calendar
                            </button>
                        </div>

                        <button
                            onClick={handleCreateTask}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-900/20 transition-all cursor-pointer"
                        >
                            <Plus className="w-5 h-5" />
                            Assign Task
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500 animate-pulse">
                        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        업무를 불러오는 중입니다...
                    </div>
                ) : view === 'list' ? renderListView() : renderCalendarView()}
            </div>
        </div>
    );
};

export default TasksPage;

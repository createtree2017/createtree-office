import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTasks } from '../hooks/useTasks';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useModal } from '../contexts/ModalContext';
import CreateTaskModal from '../components/CreateTaskModal';
import TaskDetailModal from '../components/TaskDetailModal';
import ExpandedColumnModal from '../components/ExpandedColumnModal';
import toast from 'react-hot-toast';
import { Plus, CheckCircle2, Clock, PauseCircle, AlertCircle, LayoutGrid, CalendarDays } from 'lucide-react';
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
    templateId?: number | null;
    templateTitle?: string | null;
    clientId?: number | null;
    clientName?: string | null;
    driveFolderId?: string | null;
    sortOrder?: number;
}

/* 상태별 스타일 정의 */
const STATUS_CONFIG = {
    PENDING: {
        label: '대기',
        dotClass: 'bg-slate-400 dark:bg-slate-500',
        headerClass: 'text-slate-600 dark:text-slate-400 border-b-2 border-slate-300 dark:border-slate-600',
        countClass: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600',
        dropOverClass: 'bg-slate-100/80 dark:bg-slate-700/40 ring-2 ring-slate-400/30',
        icon: <AlertCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />,
        calendarClass: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-400 dark:border-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600',
        calendarDragClass: 'bg-slate-500 text-white shadow-xl border-slate-400',
    },
    IN_PROGRESS: {
        label: '진행 중',
        dotClass: 'bg-blue-500',
        headerClass: 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 dark:border-blue-500',
        countClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40',
        dropOverClass: 'bg-blue-50/80 dark:bg-blue-900/20 ring-2 ring-blue-500/30',
        icon: <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />,
        calendarClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/40 hover:bg-blue-200 dark:hover:bg-blue-500/30',
        calendarDragClass: 'bg-blue-600 text-white shadow-xl border-blue-500',
    },
    ON_HOLD: {
        label: '보류',
        dotClass: 'bg-amber-500',
        headerClass: 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-400 dark:border-amber-500',
        countClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40',
        dropOverClass: 'bg-amber-50/80 dark:bg-amber-900/20 ring-2 ring-amber-500/30',
        icon: <PauseCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />,
        calendarClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 hover:bg-amber-200 dark:hover:bg-amber-500/30',
        calendarDragClass: 'bg-amber-500 text-white shadow-xl border-amber-400',
    },
    COMPLETED: {
        label: '완료',
        dotClass: 'bg-emerald-500',
        headerClass: 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-400 dark:border-emerald-500',
        countClass: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40',
        dropOverClass: 'bg-emerald-50/80 dark:bg-emerald-900/20 ring-2 ring-emerald-500/30',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />,
        calendarClass: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-200 dark:hover:bg-emerald-500/30',
        calendarDragClass: 'bg-emerald-500 text-white shadow-xl border-emerald-400',
    },
} as const;

// KST(+9) 기준 로컬 날짜 문자열 반환 (YYYY-MM-DD)
const toLocalDateStr = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// 두 날짜가 로컬 기준 같은 날인지 비교
const isSameLocalDate = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

const TasksPage = () => {
    const queryClient = useQueryClient();
    const { data: tasksRaw = [], isLoading: loading } = useTasks();
    const [view, setView] = useState<'list' | 'calendar'>('list');
    const [selectedClientId, setSelectedClientId] = useState<number | 'ALL'>('ALL');
    const { openModal } = useModal();

    // React Query 캐시를 기반으로 tasks 계산 (불필요한 동기화 제거)
    const tasks = React.useMemo(() => {
        return tasksRaw.map((t: any) => ({
            ...t,
            clientId: t.clientId || 0,
            clientName: t.clientName || '내부업무'
        }));
    }, [tasksRaw]);

    // 기존 fetchTasks 대체 — 캐시 무효화로 자동 리페치
    const fetchTasks = () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
    };

    // 거래처별 업무 개수 집계 (완료 제외)
    const activeTaskCount = tasks.filter(t => t.status !== 'COMPLETED').length;
    
    const clientAgg = tasks.reduce((acc, t) => {
        const id = t.clientId || 0;
        const name = t.clientName || '내부업무';
        if (!acc[id]) acc[id] = { id, name, count: 0 };
        if (t.status !== 'COMPLETED') {
            acc[id].count += 1;
        }
        return acc;
    }, {} as Record<number, { id: number; name: string; count: number }>);
    
    type ClientAggItem = { id: number; name: string; count: number };
    const activeClients = (Object.values(clientAgg) as ClientAggItem[]).sort((a, b) => {
        if (a.id === 0) return -1;
        if (b.id === 0) return 1;
        return a.name.localeCompare(b.name, 'ko-KR');
    });
    
    // 선택된 거래처에 따른 필터링 적용
    const filteredTasks = selectedClientId === 'ALL' ? tasks : tasks.filter(t => (t.clientId || 0) === selectedClientId);

    const handleCreateTask = () => openModal(<CreateTaskModal onSuccess={fetchTasks} />);
    const handleTaskClick = (task: Task) => openModal(<TaskDetailModal task={task} onSuccess={fetchTasks} />);

    const onDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        if (selectedClientId !== 'ALL') {
            toast.error('거래처 필터가 적용된 상태에서는 순서를 변경할 수 없습니다.\n전체 보기 상태에서 이용해 주세요.', { duration: 4000 });
            return;
        }

        const taskId = parseInt(draggableId);
        const newStatus = destination.droppableId as Task['status'];
        const oldStatus = source.droppableId as Task['status'];
        const isSameColumn = oldStatus === newStatus;
        const previousTasksRaw = queryClient.getQueryData<Task[]>(['tasks']) || [];

        // 1. 캐시 원본을 불변 복사 (객체의 내부 속성도 복사하여 부작용 방지)
        const updatedTasksRaw = previousTasksRaw.map(t => ({ ...t }));

        const sourceColumnTasks = updatedTasksRaw
            .filter(t => t.status === oldStatus)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        // 같은 컬럼이면 동일 배열 참조, 다른 컬럼이면 별도 배열
        const destColumnTasks = isSameColumn
            ? sourceColumnTasks
            : updatedTasksRaw
                .filter(t => t.status === newStatus)
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        // 2. 업무 이동 (제거 후 삽입)
        const [movedTask] = sourceColumnTasks.splice(source.index, 1);
        movedTask.status = newStatus;
        destColumnTasks.splice(destination.index, 0, movedTask);

        // 3. 도착 컬럼 전체의 sortOrder 재부여 및 API 페이로드 생성
        const updates: { id: number; status: Task['status']; sortOrder: number }[] = [];
        destColumnTasks.forEach((t, i) => {
            t.sortOrder = i;
            updates.push({ id: t.id, status: t.status as Task['status'], sortOrder: i });
        });
        // 컬럼 간 이동 시 출발 컬럼도 sortOrder 재정렬
        if (!isSameColumn) {
            sourceColumnTasks.forEach((t, i) => {
                t.sortOrder = i;
                updates.push({ id: t.id, status: t.status as Task['status'], sortOrder: i });
            });
        }

        // 4. 변경된 카드들로 캐시 전체 갱신 (불변 교체)
        //    — 같은 컬럼 이동 시 sourceColumnTasks === destColumnTasks 이므로
        //      affected ID 셋을 기준으로 교체
        const affectedIds = new Set(updates.map(u => u.id));
        const allAffected = [...destColumnTasks, ...(isSameColumn ? [] : sourceColumnTasks)];
        const affectedMap = new Map(allAffected.map(t => [t.id, t]));

        const finalTasksRaw = updatedTasksRaw.map(t =>
            affectedIds.has(t.id) ? affectedMap.get(t.id)! : t
        );

        // Optimistic Update: 즉시 화면 갱신 — refetch 없이 캐시만 교체
        queryClient.setQueryData(['tasks'], finalTasksRaw);

        try {
            const response = await fetch('/api/tasks/reorder', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ updates }),
            });
            const resData = await response.json();
            if (!resData.success) {
                // 실패 시 롤백 + 서버 최신 상태 동기화
                toast.error(resData.message || '상태 변경 권한이 없습니다.');
                queryClient.setQueryData(['tasks'], previousTasksRaw);
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
            }
            // 성공 시: invalidate 하지 않음 — 낙관적 업데이트 유지로 Jitter 방지
        } catch {
            // 네트워크 오류 시 롤백 + 서버 동기화
            queryClient.setQueryData(['tasks'], previousTasksRaw);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.error('순서 변경 중 네트워크 오류가 발생했습니다.');
        }
    };

    const renderKanbanView = () => {
        const statuses = Object.keys(STATUS_CONFIG) as Task['status'][];
        return (
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {statuses.map(status => {
                        const cfg = STATUS_CONFIG[status];
                        const columnTasks = filteredTasks
                            .filter(t => t.status === status)
                            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                        const visibleColumnTasks = columnTasks.slice(0, 10);
                        const isOverflow = columnTasks.length > 10;
                        return (
                            <div key={status} className="flex flex-col gap-4">
                                {/* 컬럼 헤더 (상세조회 토글 부여) */}
                                <div 
                                    className={`flex items-center justify-between px-3 py-3 rounded-t-xl transition-all cursor-pointer ${cfg.headerClass} hover:bg-slate-200/50 dark:hover:bg-slate-800/50 active:scale-[0.98] group`}
                                    onClick={() => {
                                        openModal(
                                            <ExpandedColumnModal
                                                status={status}
                                                label={cfg.label}
                                                icon={cfg.icon}
                                                tasks={columnTasks}
                                                dotClass={cfg.dotClass}
                                                headerClass={cfg.headerClass}
                                                handleTaskClick={handleTaskClick}
                                                fetchTasks={fetchTasks}
                                                selectedClientId={selectedClientId}
                                            />
                                        );
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`}></span>
                                        <span className="text-[13px] font-extrabold uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{cfg.label}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${cfg.countClass} group-hover:shadow-sm`}>{columnTasks.length} {isOverflow ? '(10개 표시)' : ''}</span>
                                </div>
                                <Droppable droppableId={status}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={`flex flex-col gap-3 min-h-[480px] p-2 rounded-2xl transition-[background-color,border-color,box-shadow,ring-color] duration-300 ${snapshot.isDraggingOver ? cfg.dropOverClass : 'bg-slate-100/50 dark:bg-slate-800/20 border border-dashed border-slate-300 dark:border-slate-700'}`}
                                        >
                                            {visibleColumnTasks.map((task, index) => (
                                                <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            onClick={() => handleTaskClick(task)}
                                                            className={`group cursor-pointer rounded-xl p-4 transition-[border-color,box-shadow,background-color] duration-200
                                                                border-2 bg-white dark:bg-[hsl(var(--card))]
                                                                ${snapshot.isDragging
                                                                    ? 'border-blue-500 shadow-2xl shadow-blue-500/20 scale-[1.03] z-50'
                                                                    : 'border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm hover:shadow-md dark:shadow-black/30'
                                                                }`}
                                                            style={{ ...provided.draggableProps.style }}
                                                        >
                                                            {/* 태스크 제목 + 상태 아이콘 */}
                                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                                <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug text-sm">
                                                                    {task.title}
                                                                </h4>
                                                                <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg shrink-0">
                                                                    {cfg.icon}
                                                                </div>
                                                            </div>
                                                            {/* 설명 */}
                                                            {task.description && (
                                                                <p className="text-[12px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                                                                    {task.description}
                                                                </p>
                                                            )}
                                                            {/* 하단: 거래처 + 담당자 + 마감일 */}
                                                            <div className="flex flex-col gap-2.5 pt-3 border-t-2 border-slate-200 dark:border-slate-600">
                                                                {/* 거래처 및 템플릿 배지 */}
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600/50 max-w-full truncate">
                                                                        {task.clientName || '내부업무'}
                                                                    </span>
                                                                    {task.templateTitle && (
                                                                        <>
                                                                            <span className="text-slate-300 dark:text-slate-600 text-[10px]">|</span>
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 max-w-full truncate">
                                                                                {task.templateTitle}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded-full bg-blue-500/20 dark:bg-blue-500/30 flex items-center justify-center text-[10px] font-black text-blue-700 dark:text-blue-300 border border-blue-400/30 dark:border-blue-400/40">
                                                                            {task.assigneeName.charAt(0)}
                                                                        </div>
                                                                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{task.assigneeName}</span>
                                                                    </div>
                                                                    {task.dueDate && (
                                                                        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                                            <Clock size={11} />
                                                                            <span className="text-[10px] font-semibold">
                                                                                {new Date(task.dueDate.slice(0, 10) + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                            {isOverflow && (
                                                <div 
                                                    className="w-full text-center py-3 text-slate-400 font-bold text-xs cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors border border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/30"
                                                    onClick={() => {
                                                        openModal(
                                                            <ExpandedColumnModal
                                                                status={status}
                                                                label={cfg.label}
                                                                icon={cfg.icon}
                                                                tasks={columnTasks}
                                                                dotClass={cfg.dotClass}
                                                                headerClass={cfg.headerClass}
                                                                handleTaskClick={handleTaskClick}
                                                                fetchTasks={fetchTasks}
                                                                selectedClientId={selectedClientId}
                                                            />
                                                        );
                                                    }}
                                                >
                                                    + {columnTasks.length - 10}개 숨겨짐 (클릭하여 전체보기)
                                                </div>
                                            )}
                                            {/* 빈 컬럼 안내 */}
                                            {columnTasks.length === 0 && (
                                                <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs font-semibold py-12">
                                                    업무를 여기로 드래그하세요
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        );
                    })}
                </div>
            </DragDropContext>
        );
    };

    const onCalendarDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId) return;

        const taskId = parseInt(draggableId);
        const newTimestamp = parseInt(destination.droppableId.split('_')[1]);
        const newDate = new Date(newTimestamp);
        // KST 기준 해당 날짜 23:59:59로 저장
        const dateStr = toLocalDateStr(newDate);
        const formattedDate = `${dateStr}T23:59:59+09:00`;
        const previousTasksRaw = queryClient.getQueryData<Task[]>(['tasks']) || [];
        const finalTasksRaw = previousTasksRaw.map(t =>
            t.id === taskId ? { ...t, dueDate: formattedDate } : t
        );

        // Optimistic Update: 즉시 화면 갱신
        queryClient.setQueryData(['tasks'], finalTasksRaw);

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ dueDate: formattedDate }),
            });
            const resData = await response.json();
            if (!resData.success) {
                // 실패 시 롤백 + 서버 동기화
                toast.error('수정 권한이 없습니다.');
                queryClient.setQueryData(['tasks'], previousTasksRaw);
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
            } else {
                toast.success('마감일이 변경되었습니다.');
                // 성공 시: invalidate 하지 않음 — 낙관적 업데이트 유지로 Jitter 방지
            }
        } catch {
            toast.error('오류가 발생했습니다.');
            queryClient.setQueryData(['tasks'], previousTasksRaw);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    };

    const handleCalendarDayClick = (date: Date) => {
        const dateStr = toLocalDateStr(date);
        openModal(<CreateTaskModal onSuccess={fetchTasks} initialData={{ dueDate: dateStr }} />);
    };

    const renderCalendarView = () => (
        <div className="bento-card p-6 md:p-10">
            <DragDropContext onDragEnd={onCalendarDragEnd}>
                <Calendar
                    className="w-full bg-transparent border-none"
                    onClickDay={(date, e) => {
                        // 이벤트 배지 클릭은 제외 (stopPropagation으로 이미 처리됨)
                        handleCalendarDayClick(date);
                    }}
                    tileContent={({ date }: { date: Date }) => {
                        const dayTasks = filteredTasks.filter(t => t.dueDate && isSameLocalDate(new Date(t.dueDate), date));
                        return (
                            <Droppable droppableId={`cal_${date.getTime()}`}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex flex-col gap-1.5 mt-1 w-full min-h-[50px] rounded-lg p-1 transition-[background-color,ring-color] ${snapshot.isDraggingOver ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-400/40' : ''}`}
                                    >
                                        {dayTasks.map((t, index) => {
                                            const cfg = STATUS_CONFIG[t.status as keyof typeof STATUS_CONFIG];
                                            if (!cfg) return null;
                                            return (
                                                <Draggable key={`cal_task_${t.id}`} draggableId={t.id.toString()} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            onClick={(e) => { e.stopPropagation(); handleTaskClick(t); }}
                                                            className={`text-[10px] font-bold px-2 py-1 rounded-md select-none cursor-pointer truncate transition-[border-color,box-shadow,background-color] border
                                                            ${snapshot.isDragging
                                                                    ? cfg.calendarDragClass
                                                                    : cfg.calendarClass
                                                                }`}
                                                            title={`[${cfg.label}] ${t.title}`}
                                                        >
                                                            {t.title}
                                                        </div>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        );
                    }}
                />
            </DragDropContext>
            {/* 캘린더 다크모드 CSS */}
            <style>{`
                .react-calendar { width: 100% !important; background: transparent; border: none; font-family: 'Pretendard', 'Noto Sans KR', sans-serif; }
                .react-calendar__tile {
                    padding: 0.75em 0.5em !important;
                    height: 150px;
                    display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start;
                    border: 2px solid !important;
                    overflow: hidden;
                    transition: all 0.2s;
                }
                /* 라이트모드 */
                .react-calendar__tile { color: #334155; border-color: #cbd5e1 !important; background: #ffffff; }
                .react-calendar__tile:enabled:hover, .react-calendar__tile:enabled:focus { background: #f1f5f9; border-color: #94a3b8 !important; }
                .react-calendar__tile--now { background: #eff6ff !important; border-color: #3b82f6 !important; }
                .react-calendar__tile--now abbr { font-weight: 900; color: #2563eb; }
                .react-calendar__tile--active { background: #dbeafe !important; border-color: #3b82f6 !important; }
                .react-calendar__navigation { margin-bottom: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; }
                .react-calendar__navigation button { color: #0f172a; font-size: 1rem; font-weight: 800; min-width: 44px; background: none; transition: all 0.2s; border-radius: 10px; }
                .react-calendar__navigation button:enabled:hover { background: #f1f5f9; }
                .react-calendar__month-view__weekdays { text-transform: uppercase; font-weight: 900; font-size: 0.65rem; color: #64748b; margin-bottom: 0.5rem; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
                .react-calendar__month-view__weekdays__weekday abbr { text-decoration: none; }
                .react-calendar__month-view__days__day--neighboringMonth { color: #cbd5e1; background: #f8fafc; }
                .react-calendar__month-view__days__day--weekend { color: #f43f5e; }

                /* 다크모드 */
                .dark .react-calendar__tile { color: #cbd5e1; border-color: #334155 !important; background: #1e293b; }
                .dark .react-calendar__tile:enabled:hover { background: #273347; border-color: #475569 !important; }
                .dark .react-calendar__tile--now { background: #1e3a5f !important; border-color: #3b82f6 !important; }
                .dark .react-calendar__tile--now abbr { color: #60a5fa; }
                .dark .react-calendar__tile--active { background: #1e3a5f !important; border-color: #3b82f6 !important; }
                .dark .react-calendar__navigation button { color: #f1f5f9; }
                .dark .react-calendar__navigation button:enabled:hover { background: #273347; }
                .dark .react-calendar__navigation { border-bottom-color: #334155; }
                .dark .react-calendar__month-view__weekdays { color: #64748b; border-bottom-color: #334155; }
                .dark .react-calendar__month-view__days__day--neighboringMonth { color: #334155; background: #161e2e; }
                .dark .react-calendar__month-view__days__day--weekend { color: #f87171; }
            `}</style>
        </div>
    );

    return (
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-6 pt-20 md:p-10 md:pt-20 lg:p-12 lg:pt-20">
            <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
                {/* 페이지 헤더 */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            협업 워크스페이스
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">업무 관리</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium text-lg max-w-lg">팀의 생산성을 높이고 실시간으로 업무 진행 상황을 추적하세요.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* 뷰 전환 토글 */}
                        <div className="bg-slate-200 dark:bg-slate-700 p-1 rounded-xl border border-slate-300 dark:border-slate-600 flex shadow-sm">
                            <button
                                onClick={() => setView('list')}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'list'
                                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md border border-slate-200 dark:border-slate-600'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                            >
                                <LayoutGrid size={15} />
                                칸반
                            </button>
                            <button
                                onClick={() => setView('calendar')}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'calendar'
                                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md border border-slate-200 dark:border-slate-600'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                            >
                                <CalendarDays size={15} />
                                캘린더
                            </button>
                        </div>

                        {/* 새 업무 버튼 */}
                        <button
                            onClick={handleCreateTask}
                            className="bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-500/30 transition-all cursor-pointer active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            새 업무
                        </button>
                    </div>
                </div>

                {/* 거래처 필터 */}
                {!loading && tasks.length > 0 && (
                    <div className="mb-8">
                        <p className="text-[12px] text-slate-400 dark:text-slate-500 font-bold mb-2 ml-1">* 완료를 제외한 업무의 카운팅</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setSelectedClientId('ALL')}
                                className={`px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                                    selectedClientId === 'ALL'
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                                        : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                전체 ({activeTaskCount})
                            </button>
                            {activeClients.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedClientId(c.id)}
                                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5 ${
                                        selectedClientId === c.id
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                            : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    {c.name}
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                                        selectedClientId === c.id
                                            ? 'bg-white/20 text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                    }`}>
                                        {c.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 콘텐츠 */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-400 dark:text-slate-500">
                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-5"></div>
                        <div className="font-bold tracking-wide animate-pulse">워크스페이스 불러오는 중...</div>
                    </div>
                ) : view === 'list' ? renderKanbanView() : renderCalendarView()}
            </div>
        </div>
    );
};

export default TasksPage;

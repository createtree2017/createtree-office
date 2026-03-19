import React from 'react';

interface ClientOption {
    id: number | 'all' | 'unassigned';
    name: string;
}

interface ClientFilterProps {
    clients: { id: number; name: string }[];
    selectedId: number | 'all' | 'unassigned';
    onSelect: (id: number | 'all' | 'unassigned') => void;
    showUnassigned?: boolean;
    /** 색상 변형: 'default'(관리자용 초록/파랑), 'violet'(사용자용 보라색) */
    variant?: 'default' | 'violet';
}

const VARIANT_STYLES = {
    default: {
        all: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/25',
        unassigned: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25',
        client: 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25',
        inactive: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400',
    },
    violet: {
        all: 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/25',
        unassigned: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25',
        client: 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/25',
        inactive: 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] hover:border-violet-300',
    },
};

const ClientFilter: React.FC<ClientFilterProps> = ({ clients, selectedId, onSelect, showUnassigned = false, variant = 'default' }) => {
    const styles = VARIANT_STYLES[variant];
    const options: ClientOption[] = [
        { id: 'all', name: '전체' },
        ...(showUnassigned ? [{ id: 'unassigned' as const, name: '미배정' }] : []),
        ...clients.map(c => ({ id: c.id, name: c.name })),
    ];

    return (
        <div className="flex flex-wrap gap-2 mb-5 pt-4">
            {options.map(opt => {
                const isActive = selectedId === opt.id;
                const activeStyle = opt.id === 'all' ? styles.all
                    : opt.id === 'unassigned' ? styles.unassigned
                    : styles.client;
                return (
                    <button
                        key={String(opt.id)}
                        onClick={() => onSelect(opt.id)}
                        className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold tracking-wide transition-all duration-200 border ${
                            isActive ? activeStyle : styles.inactive
                        }`}
                    >
                        {opt.name}
                    </button>
                );
            })}
        </div>
    );
};

export default ClientFilter;

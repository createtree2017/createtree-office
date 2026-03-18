import React from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Users, Building2, FileText, FileCheck, XCircle, LayoutTemplate, Package, Briefcase, Settings2 } from 'lucide-react';

// ── 탭 정의 ──
interface TabItem {
    label: string;
    icon: React.ElementType;
    path: string;
    tab?: string;          // ?tab= 쿼리 파라미터
    matchPaths?: string[]; // 추가 경로 매칭 (활성 탭 강조용)
}

const CLIENT_TABS: TabItem[] = [
    { label: '회원 관리', icon: Users, path: '/admin', tab: 'users' },
    { label: '병원 관리', icon: Building2, path: '/admin', tab: 'clients' },
    { label: '견적 관리', icon: FileText, path: '/quotations' },
    { label: '계약 관리', icon: FileCheck, path: '/contracts' },
    { label: '계약 종료', icon: XCircle, path: '/admin', tab: 'terminated' },
];

const PRODUCT_TABS: TabItem[] = [
    { label: '템플릿 관리', icon: LayoutTemplate, path: '/templates' },
    { label: '서비스 관리', icon: Package, path: '/services' },
];

const GROUP_CONFIG = {
    client: {
        tabs: CLIENT_TABS,
        title: '거래처 관리',
        description: '종합적인 거래처 견적 및 계약관계를 관리합니다.',
        icon: Briefcase,
        badgeColor: 'bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300',
    },
    product: {
        tabs: PRODUCT_TABS,
        title: '상품 관리',
        description: '서비스 상품 및 템플릿을 관리합니다.',
        icon: Settings2,
        badgeColor: 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
    },
} as const;

type GroupType = keyof typeof GROUP_CONFIG;

interface SubNavProps {
    group: GroupType;
    rightSlot?: React.ReactNode; // 헤더 오른쪽 버튼 등
}

const SubNav: React.FC<SubNavProps> = ({ group, rightSlot }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const config = GROUP_CONFIG[group];
    const currentTab = searchParams.get('tab');

    const isTabActive = (item: TabItem): boolean => {
        // tab 쿼리 파라미터가 있는 경우 (AdminPage 내부 탭)
        if (item.tab) {
            return location.pathname === item.path && currentTab === item.tab;
        }
        // 독립 경로 페이지
        return location.pathname === item.path || (item.matchPaths?.some(p => location.pathname.startsWith(p)) ?? false);
    };

    const handleTabClick = (item: TabItem) => {
        if (item.tab) {
            navigate(`${item.path}?tab=${item.tab}`);
        } else {
            navigate(item.path);
        }
    };

    return (
        <div className="mb-8">
            {/* 헤더 */}
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
                <div>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider mb-3 shadow-sm ${config.badgeColor}`}>
                        <config.icon size={12} />
                        {config.title}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                        {config.title}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium text-base">
                        {config.description}
                    </p>
                </div>
                {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
            </div>

            {/* 탭 바 */}
            <div className="flex gap-1 border-b border-[hsl(var(--border))]">
                {config.tabs.map((item) => {
                    const Icon = item.icon;
                    const active = isTabActive(item);
                    return (
                        <button
                            key={item.label}
                            onClick={() => handleTabClick(item)}
                            className={`flex items-center gap-1.5 pb-3 px-3 text-[14px] font-bold transition-all relative ${
                                active
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            <Icon size={14} />
                            {item.label}
                            {active && (
                                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default SubNav;

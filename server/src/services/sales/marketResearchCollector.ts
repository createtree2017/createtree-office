import type { marketResearchItems } from "../../db/schema.js";
import { importPostpartumCareCsvFromDrive } from "./postpartumCareCsvImporter.js";

type NewMarketResearchItem = typeof marketResearchItems.$inferInsert;

export interface MarketResearchCollectOptions {
    title?: string;
    regionScope?: string;
    regions?: string[];
    businessTypes?: string[];
    operationStatuses?: string[];
}

export interface MarketResearchCollectResult {
    items: NewMarketResearchItem[];
    sources: string[];
    errors: Array<{ source: string; message: string }>;
}

const DEFAULT_SOURCES = [
    "HIRA 병원정보서비스",
    "HIRA 요양기관개폐업정보서비스",
    "행정안전부 지방행정 인허가/조회서비스",
    "보건복지부 산후조리원 현황",
    "KOSIS/주민등록 출생통계",
    "Google Places",
    "공식 홈페이지/SNS",
];

function normalizeText(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, "").toLowerCase();
}

export function buildStableKey(name: string, address?: string | null, phone?: string | null): string {
    return [normalizeText(name), normalizeText(address), normalizeText(phone)].filter(Boolean).join("|");
}

function normalizeRegion(input: string | undefined): string {
    if (!input || input === "전국") return "전국";
    return input;
}

function buildBaseItems(options: MarketResearchCollectOptions): NewMarketResearchItem[] {
    const preferredRegion = normalizeRegion(options.regions?.[0] || options.regionScope);
    const now = new Date();
    const items: Array<Omit<NewMarketResearchItem, "stableKey" | "normalizedName">> = [
        {
            name: "포유문산부인과",
            businessType: "delivery_hospital",
            region: preferredRegion === "전국" ? "서울" : preferredRegion,
            city: "서울",
            district: "송파구",
            address: "서울 송파구 잠실동",
            operationStatus: "operating",
            phone: "02-0000-0000",
            email: "info@4uhospital.example",
            website: "https://example.com/4u",
            instagram: "@4u_obgyn",
            isNew: false,
            hasUpdates: false,
            isSelected: false,
            isDeliveryHospital: true,
            deliveryCountYear: 2025,
            deliveryCount: 200,
            deliveryCountSource: "홈페이지/홍보자료 확인 필요",
            medicalDepartments: ["산부인과", "마취통증의학과", "소아청소년과"],
            doctorCounts: { "산부인과": 5, "마취통증의학과": 1, "소아청소년과": 1 },
            totalDoctorCount: 7,
            hasDeliveryCenter: true,
            hasFertilityCenter: false,
            hasPediatricLink: true,
            buildingScale: "일부층 사용, 층수 확인 필요",
            occupiedFloors: "확인필요",
            isStandaloneBuilding: false,
            parkingAvailable: true,
            marketScore: 86,
            priorityGrade: "A",
            sources: ["HIRA", "Google Places", "홈페이지"],
            sourceUrls: [],
            sourceConfidence: "needs_review",
            verificationStatus: "needs_review",
            rawData: { note: "개발/검증용 샘플. 실제 API 키 연결 후 공식 원천으로 갱신" },
            lastResearchedAt: now,
        },
        {
            name: "새봄여성병원",
            businessType: "women_hospital",
            region: preferredRegion === "전국" ? "인천" : preferredRegion,
            city: "인천",
            district: "부평구",
            address: "인천 부평구",
            operationStatus: "newly_opened",
            phone: "032-000-0000",
            email: null,
            website: "https://example.com/saebom",
            instagram: "@saebom_women",
            isNew: true,
            hasUpdates: false,
            isSelected: false,
            isDeliveryHospital: true,
            deliveryCountYear: 2025,
            deliveryCount: null,
            deliveryCountSource: "공개자료 없음",
            medicalDepartments: ["산부인과", "내과", "피부과"],
            doctorCounts: { "산부인과": 4, "내과": 1, "피부과": 1 },
            totalDoctorCount: 6,
            hasDeliveryCenter: true,
            hasFertilityCenter: true,
            hasPediatricLink: false,
            buildingScale: "단독건물 여부 확인 필요",
            occupiedFloors: "확인필요",
            isStandaloneBuilding: null,
            parkingAvailable: true,
            marketScore: 78,
            priorityGrade: "A",
            sources: ["HIRA", "행정안전부 공공데이터", "Google Places"],
            sourceUrls: [],
            sourceConfidence: "needs_review",
            verificationStatus: "needs_review",
            rawData: { note: "신규 개업 판정은 개폐업 API 연결 후 확정" },
            lastResearchedAt: now,
        },
        {
            name: "더블레스산후조리원",
            businessType: "postpartum_center",
            region: preferredRegion === "전국" ? "서울" : preferredRegion,
            city: "서울",
            district: "노원구",
            address: "서울 노원구",
            operationStatus: "operating",
            phone: "02-1111-1111",
            email: "contact@blesscare.example",
            website: "https://example.com/bless",
            instagram: "@bless_postpartum",
            isNew: false,
            hasUpdates: false,
            isSelected: false,
            isDeliveryHospital: false,
            roomCount: 24,
            motherCapacity: 24,
            babyCapacity: 24,
            roomGrades: [
                { grade: "일반실", count: 16, price: "2주 350만원대 확인필요" },
                { grade: "VIP", count: 8, price: "2주 500만원대 확인필요" },
            ],
            aestheticBrand: "외부 입점 브랜드 확인필요",
            additionalServices: ["마사지", "모유수유", "산모교실", "신생아 케어"],
            buildingScale: "복합건물 내 일부층",
            occupiedFloors: "확인필요",
            isStandaloneBuilding: false,
            parkingAvailable: true,
            marketScore: 72,
            priorityGrade: "B",
            sources: ["행정안전부 공공데이터", "보건복지부 산후조리원 현황", "홈페이지"],
            sourceUrls: [],
            sourceConfidence: "needs_review",
            verificationStatus: "needs_review",
            rawData: { note: "객실 등급과 에스테틱 브랜드는 홈페이지/전화 검증 필요" },
            lastResearchedAt: now,
        },
    ];

    const allowedTypes = new Set(options.businessTypes || []);
    const allowedStatuses = new Set(options.operationStatuses || []);
    return items
        .filter((item) => allowedTypes.size === 0 || allowedTypes.has(String(item.businessType)) || (allowedTypes.has("obgyn") && ["delivery_hospital", "general_obgyn", "women_hospital"].includes(String(item.businessType))))
        .filter((item) => allowedStatuses.size === 0 || allowedStatuses.has(String(item.operationStatus)))
        .map((item) => ({
            ...item,
            stableKey: buildStableKey(item.name || "", item.address, item.phone),
            normalizedName: normalizeText(item.name || ""),
        }));
}

export async function collectMarketResearchItems(options: MarketResearchCollectOptions): Promise<MarketResearchCollectResult> {
    const errors: Array<{ source: string; message: string }> = [];
    const publicDataKey = process.env.PUBLIC_DATA_SERVICE_KEY || process.env.HIRA_SERVICE_KEY;
    const postpartumImport = await importPostpartumCareCsvFromDrive({
        businessTypes: options.businessTypes,
        operationStatuses: options.operationStatuses,
        regions: options.regions,
    });

    if (!publicDataKey) {
        errors.push({ source: "공공데이터포털", message: "PUBLIC_DATA_SERVICE_KEY가 없어 HIRA/행정안전부 API 수집은 건너뛰었습니다." });
    }
    if (!process.env.KOSIS_API_KEY) {
        errors.push({ source: "KOSIS", message: "KOSIS API 키가 없어 출산율 자동조회는 건너뛰었습니다." });
    }
    if (!process.env.GOOGLE_PLACES_API_KEY) {
        errors.push({ source: "Google Places", message: "Google Places API 키가 없어 지도/리뷰 보강은 건너뛰었습니다." });
    }
    errors.push(...postpartumImport.errors);

    const baseItems = buildBaseItems(options);
    const items = postpartumImport.items.length > 0
        ? [
            ...baseItems.filter((item) => item.businessType !== "postpartum_center"),
            ...postpartumImport.items,
        ]
        : baseItems;
    const sources = postpartumImport.sourceName
        ? [...DEFAULT_SOURCES, `Google Drive CSV:${postpartumImport.sourceName}`]
        : DEFAULT_SOURCES;

    return {
        items,
        sources,
        errors,
    };
}

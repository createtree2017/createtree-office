import type { marketResearchItems } from "../../db/schema.js";
import { importPostpartumCareCsvFromDrive } from "./postpartumCareCsvImporter.js";

type NewMarketResearchItem = typeof marketResearchItems.$inferInsert;
type BusinessType = "obgyn" | "delivery_hospital" | "general_obgyn" | "women_hospital" | "postpartum_center";
type OperationStatus = "operating" | "closed" | "newly_opened" | "unknown";

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

const HIRA_HOSPITAL_ENDPOINT = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const OBGYN_DEPARTMENT_CODE = "10";
const DEFAULT_HIRA_ROWS_PER_PAGE = 100;
const DEFAULT_HIRA_MAX_ROWS = 10000;
const DEFAULT_GOOGLE_PLACES_LIMIT = 50;

const HIRA_SIDO_CODES: Record<string, string> = {
    서울: "110000",
    부산: "210000",
    인천: "220000",
    대구: "230000",
    광주: "240000",
    대전: "250000",
    울산: "260000",
    경기: "310000",
    강원: "320000",
    충북: "330000",
    충남: "340000",
    전북: "350000",
    전남: "360000",
    경북: "370000",
    경남: "380000",
    제주: "390000",
    세종: "410000",
};

interface HiraHospitalRow {
    yadmNm?: string;
    addr?: string;
    telno?: string;
    hospUrl?: string;
    clCd?: string;
    clCdNm?: string;
    sidoCdNm?: string;
    sgguCdNm?: string;
    dgsbjtCd?: string;
    drTotCnt?: string;
    mdeptGdrCnt?: string;
    mdeptIntnCnt?: string;
    mdeptResdntCnt?: string;
    mdeptSdrCnt?: string;
    XPos?: string;
    YPos?: string;
    xPos?: string;
    yPos?: string;
    [key: string]: string | undefined;
}

interface GooglePlace {
    id?: string;
    displayName?: { text?: string; languageCode?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    businessStatus?: string;
    location?: { latitude?: number; longitude?: number };
    types?: string[];
}

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

function toInt(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function getEnvInt(name: string, fallback: number): number {
    const parsed = parseInt(process.env[name] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeXml(value: string): string {
    return value
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
}

function getXmlTag(block: string, tag: string): string | undefined {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match ? decodeXml(match[1]) : undefined;
}

function parseHiraItems(xml: string): HiraHospitalRow[] {
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    return itemBlocks.map((block) => {
        const row: HiraHospitalRow = {};
        const innerBlock = block.replace(/^<item>/i, "").replace(/<\/item>$/i, "");
        const tagRegex = /<([A-Za-z][A-Za-z0-9_]*)>([\s\S]*?)<\/\1>/g;
        let match: RegExpExecArray | null;
        while ((match = tagRegex.exec(innerBlock)) !== null) {
            row[match[1]] = decodeXml(match[2]);
        }
        return row;
    });
}

function getHiraTotalCount(xml: string): number {
    return toInt(getXmlTag(xml, "totalCount")) || 0;
}

function getHiraResultMessage(xml: string): string | null {
    const resultCode = getXmlTag(xml, "resultCode") || getXmlTag(xml, "returnAuthMsg") || getXmlTag(xml, "errMsg");
    const resultMsg = getXmlTag(xml, "resultMsg") || getXmlTag(xml, "returnReasonCode") || getXmlTag(xml, "returnAuthMsg");
    if (!resultCode && !resultMsg) return null;
    if (resultCode === "00" || resultMsg === "NORMAL SERVICE.") return null;
    return [resultCode, resultMsg].filter(Boolean).join(" ");
}

function buildPublicDataServiceKeyParam(serviceKey: string): string {
    return serviceKey.includes("%") ? serviceKey : encodeURIComponent(serviceKey);
}

function buildHiraUrl(serviceKey: string, params: Record<string, string | number | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const queryString = query.toString();
    return `${HIRA_HOSPITAL_ENDPOINT}?ServiceKey=${buildPublicDataServiceKeyParam(serviceKey)}${queryString ? `&${queryString}` : ""}`;
}

function splitAddress(address: string | null | undefined): { region: string; city: string | null; district: string | null } {
    const parts = String(address || "").split(/\s+/).filter(Boolean);
    return {
        region: parts[0] || "전국",
        city: parts[0] || null,
        district: parts[1] || null,
    };
}

function wantsObgynCollection(businessTypes: string[] | undefined): boolean {
    if (!businessTypes || businessTypes.length === 0) return true;
    return businessTypes.some((type) => ["obgyn", "delivery_hospital", "general_obgyn", "women_hospital"].includes(type));
}

function inferHospitalBusinessType(row: HiraHospitalRow): BusinessType {
    const name = row.yadmNm || "";
    const className = row.clCdNm || "";
    const classCode = row.clCd || "";
    const normalized = normalizeText(`${name} ${className}`);

    if (normalized.includes("여성병원") || normalized.includes("우먼") || normalized.includes("w여성")) return "women_hospital";
    if (normalized.includes("분만") || normalized.includes("산부인과병원")) return "delivery_hospital";
    if (classCode !== "31") return "obgyn";
    return "general_obgyn";
}

function businessTypeAllowed(businessType: BusinessType, requestedTypes: string[] | undefined): boolean {
    if (!requestedTypes || requestedTypes.length === 0) return true;
    if (requestedTypes.includes("obgyn") && ["obgyn", "delivery_hospital", "general_obgyn", "women_hospital"].includes(businessType)) return true;
    return requestedTypes.includes(businessType);
}

function operationStatusAllowed(operationStatus: OperationStatus, requestedStatuses: string[] | undefined): boolean {
    return !requestedStatuses || requestedStatuses.length === 0 || requestedStatuses.includes(operationStatus);
}

function regionAllowed(item: NewMarketResearchItem, requestedRegions: string[] | undefined): boolean {
    if (!requestedRegions || requestedRegions.length === 0 || requestedRegions.includes("전국")) return true;
    return requestedRegions.includes(String(item.region)) || requestedRegions.includes(String(item.city));
}

function calculateMarketScore(item: Partial<NewMarketResearchItem>): number {
    let score = item.businessType === "delivery_hospital" ? 78 : item.businessType === "women_hospital" ? 74 : 62;
    if (item.website) score += 5;
    if (item.phone) score += 3;
    if ((item.totalDoctorCount || 0) >= 5) score += 6;
    if ((item.totalDoctorCount || 0) >= 10) score += 4;
    if (item.hasDeliveryCenter) score += 5;
    return Math.min(score, 95);
}

function priorityGrade(score: number): string {
    if (score >= 80) return "A";
    if (score >= 65) return "B";
    return "C";
}

function mapHiraRowToItem(row: HiraHospitalRow): NewMarketResearchItem | null {
    const name = row.yadmNm?.trim();
    if (!name) return null;

    const address = row.addr || "";
    const addressParts = splitAddress(address);
    const businessType = inferHospitalBusinessType(row);
    const totalDoctorCount = toInt(row.drTotCnt);
    const x = row.XPos || row.xPos || null;
    const y = row.YPos || row.yPos || null;
    const medicalDepartments = ["산부인과"];
    const doctorCounts: Record<string, number> = totalDoctorCount ? { 산부인과: totalDoctorCount } : {};
    const partial: Partial<NewMarketResearchItem> = {
        businessType,
        phone: row.telno || null,
        website: row.hospUrl || null,
        totalDoctorCount,
        hasDeliveryCenter: businessType !== "general_obgyn",
    };
    const marketScore = calculateMarketScore(partial);

    return {
        stableKey: buildStableKey(name, address, row.telno),
        businessType,
        name,
        normalizedName: normalizeText(name),
        region: row.sidoCdNm || addressParts.region,
        city: row.sidoCdNm || addressParts.city,
        district: row.sgguCdNm || addressParts.district,
        address,
        operationStatus: "operating",
        phone: row.telno || null,
        email: null,
        website: row.hospUrl || null,
        isNew: false,
        hasUpdates: false,
        isSelected: false,
        isDeliveryHospital: ["delivery_hospital", "women_hospital"].includes(businessType),
        deliveryCountYear: null,
        deliveryCount: null,
        deliveryCountSource: "HIRA 병원정보서비스에는 분만 건수가 없어 확인 필요",
        medicalDepartments,
        doctorCounts,
        totalDoctorCount,
        hasDeliveryCenter: ["delivery_hospital", "women_hospital"].includes(businessType),
        hasFertilityCenter: normalizeText(name).includes("난임"),
        hasPediatricLink: false,
        buildingScale: row.clCdNm || null,
        occupiedFloors: null,
        isStandaloneBuilding: null,
        parkingAvailable: null,
        latitude: y,
        longitude: x,
        marketScore,
        priorityGrade: priorityGrade(marketScore),
        sources: ["HIRA 병원정보서비스"],
        sourceUrls: [row.hospUrl].filter(Boolean) as string[],
        sourceConfidence: "official",
        verificationStatus: "auto_collected",
        rawData: { hira: row },
        lastResearchedAt: new Date(),
    };
}

async function fetchHiraObgynItems(options: MarketResearchCollectOptions, serviceKey: string): Promise<MarketResearchCollectResult> {
    if (!wantsObgynCollection(options.businessTypes)) {
        return { items: [], sources: [], errors: [] };
    }

    const rowsPerPage = Math.min(getEnvInt("MARKET_RESEARCH_HIRA_ROWS_PER_PAGE", DEFAULT_HIRA_ROWS_PER_PAGE), 100);
    const maxRows = getEnvInt("MARKET_RESEARCH_HIRA_MAX_ROWS", DEFAULT_HIRA_MAX_ROWS);
    const selectedRegion = options.regions?.find((region) => region !== "전국");
    const sidoCd = selectedRegion ? HIRA_SIDO_CODES[selectedRegion] : undefined;
    const errors: MarketResearchCollectResult["errors"] = [];
    const rows: HiraHospitalRow[] = [];
    let totalCount = 0;
    let pageNo = 1;

    try {
        while (rows.length < maxRows) {
            const remainingRows = Math.max(maxRows - rows.length, 1);
            const url = buildHiraUrl(serviceKey, {
                pageNo,
                numOfRows: Math.min(rowsPerPage, remainingRows),
                sidoCd,
                dgsbjtCd: OBGYN_DEPARTMENT_CODE,
            });
            const response = await fetch(url);
            const xml = await response.text();
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const message = getHiraResultMessage(xml);
            if (message) throw new Error(message);

            const pageItems = parseHiraItems(xml);
            totalCount = totalCount || getHiraTotalCount(xml);
            rows.push(...pageItems);
            if (pageItems.length === 0 || rows.length >= totalCount) break;
            pageNo++;
        }
    } catch (error: any) {
        errors.push({ source: "HIRA 병원정보서비스", message: error?.message || "HIRA 병원정보 수집 실패" });
    }

    const items = rows
        .map(mapHiraRowToItem)
        .filter((item): item is NewMarketResearchItem => !!item)
        .filter((item) => businessTypeAllowed(item.businessType, options.businessTypes))
        .filter((item) => operationStatusAllowed(item.operationStatus || "unknown", options.operationStatuses))
        .filter((item) => regionAllowed(item, options.regions));

    if (totalCount > maxRows && rows.length >= maxRows) {
        errors.push({ source: "HIRA 병원정보서비스", message: `수집 상한 ${maxRows}건에 도달해 일부 결과만 저장했습니다. MARKET_RESEARCH_HIRA_MAX_ROWS로 조정 가능합니다.` });
    }

    return {
        items,
        sources: items.length > 0 ? ["HIRA 병원정보서비스"] : [],
        errors,
    };
}

async function searchGooglePlace(item: NewMarketResearchItem, apiKey: string): Promise<GooglePlace | null> {
    const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
                "places.id",
                "places.displayName",
                "places.formattedAddress",
                "places.nationalPhoneNumber",
                "places.internationalPhoneNumber",
                "places.websiteUri",
                "places.googleMapsUri",
                "places.businessStatus",
                "places.location",
                "places.types",
            ].join(","),
        },
        body: JSON.stringify({
            textQuery: `${item.name} ${item.address || item.region || ""}`.trim(),
            languageCode: "ko",
            regionCode: "KR",
            pageSize: 1,
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google Places HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = await response.json() as { places?: GooglePlace[] };
    return data.places?.[0] || null;
}

function mergeGooglePlace(item: NewMarketResearchItem, place: GooglePlace): NewMarketResearchItem {
    const operationStatus: OperationStatus = place.businessStatus === "CLOSED_PERMANENTLY" ? "closed" : item.operationStatus || "unknown";
    const phone = item.phone || place.nationalPhoneNumber || place.internationalPhoneNumber || null;
    const website = item.website || place.websiteUri || null;
    const sourceUrls = Array.from(new Set([...(item.sourceUrls || []), place.googleMapsUri, place.websiteUri].filter(Boolean) as string[]));
    const sources = Array.from(new Set([...(item.sources || []), "Google Places"]));
    const marketScore = calculateMarketScore({ ...item, phone, website });

    return {
        ...item,
        operationStatus,
        phone,
        website,
        address: item.address || place.formattedAddress || null,
        latitude: item.latitude || (place.location?.latitude !== undefined ? String(place.location.latitude) : null),
        longitude: item.longitude || (place.location?.longitude !== undefined ? String(place.location.longitude) : null),
        marketScore,
        priorityGrade: priorityGrade(marketScore),
        sources,
        sourceUrls,
        rawData: {
            ...(item.rawData || {}),
            googlePlace: place,
        },
    };
}

async function enrichWithGooglePlaces(items: NewMarketResearchItem[], apiKey: string): Promise<MarketResearchCollectResult> {
    const limit = Math.min(getEnvInt("MARKET_RESEARCH_GOOGLE_PLACES_LIMIT", DEFAULT_GOOGLE_PLACES_LIMIT), items.length);
    const errors: MarketResearchCollectResult["errors"] = [];
    const enriched: NewMarketResearchItem[] = [];

    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (index >= limit) {
            enriched.push(item);
            continue;
        }
        try {
            const place = await searchGooglePlace(item, apiKey);
            enriched.push(place ? mergeGooglePlace(item, place) : item);
        } catch (error: any) {
            errors.push({ source: "Google Places", message: `${item.name}: ${error?.message || "보강 실패"}` });
            enriched.push(item);
        }
    }

    return {
        items: enriched,
        sources: limit > 0 ? ["Google Places"] : [],
        errors,
    };
}

function mergeUniqueItems(groups: NewMarketResearchItem[][]): NewMarketResearchItem[] {
    const byKey = new Map<string, NewMarketResearchItem>();
    for (const group of groups) {
        for (const item of group) {
            const key = item.stableKey || buildStableKey(item.name, item.address, item.phone);
            const existing = byKey.get(key);
            byKey.set(key, existing ? {
                ...existing,
                ...item,
                sources: Array.from(new Set([...(existing.sources || []), ...(item.sources || [])])),
                sourceUrls: Array.from(new Set([...(existing.sourceUrls || []), ...(item.sourceUrls || [])])),
                rawData: { ...(existing.rawData || {}), ...(item.rawData || {}) },
            } : item);
        }
    }
    return Array.from(byKey.values());
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
    const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
    const hiraResult = publicDataKey
        ? await fetchHiraObgynItems(options, publicDataKey)
        : { items: [], sources: [], errors: [{ source: "공공데이터포털", message: "PUBLIC_DATA_SERVICE_KEY가 없어 HIRA 병원정보서비스 수집은 건너뛰었습니다." }] };
    const postpartumImport = await importPostpartumCareCsvFromDrive({
        businessTypes: options.businessTypes,
        operationStatuses: options.operationStatuses,
        regions: options.regions,
    });
    const hospitalItems = googlePlacesKey
        ? await enrichWithGooglePlaces(hiraResult.items, googlePlacesKey)
        : { items: hiraResult.items, sources: [], errors: hiraResult.items.length > 0 ? [{ source: "Google Places", message: "GOOGLE_PLACES_API_KEY가 없어 지도/홈페이지 보강은 건너뛰었습니다." }] : [] };

    if (!process.env.KOSIS_API_KEY) {
        errors.push({ source: "KOSIS", message: "KOSIS API 키가 없어 출산율 자동조회는 건너뛰었습니다." });
    }
    errors.push(...hiraResult.errors);
    errors.push(...hospitalItems.errors);
    errors.push(...postpartumImport.errors);

    const realItems = mergeUniqueItems([hospitalItems.items, postpartumImport.items]);
    const items = realItems.length > 0 ? realItems : buildBaseItems(options);
    if (realItems.length === 0) {
        errors.push({ source: "시장조사 수집기", message: "실제 원천 수집 결과가 없어 검증용 샘플 데이터를 반환했습니다." });
    }
    const sources = Array.from(new Set([
        ...DEFAULT_SOURCES,
        ...hiraResult.sources,
        ...hospitalItems.sources,
        ...(postpartumImport.sourceName ? [`Google Drive CSV:${postpartumImport.sourceName}`] : []),
    ]));

    return {
        items,
        sources,
        errors,
    };
}

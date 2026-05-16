import type { marketResearchItems } from "../../db/schema.js";
import { importPostpartumCareCsvFromDrive } from "./postpartumCareCsvImporter.js";
import * as cheerio from "cheerio";

type NewMarketResearchItem = typeof marketResearchItems.$inferInsert;
type BusinessType = "obgyn" | "delivery_hospital" | "general_obgyn" | "women_hospital" | "postpartum_center";
type OperationStatus = "operating" | "closed" | "newly_opened" | "unknown";

export interface MarketResearchCollectOptions {
    title?: string;
    regionScope?: string;
    regions?: string[];
    businessTypes?: string[];
    operationStatuses?: string[];
    queryName?: string;
    onProgress?: (stats: MarketResearchProgressStats) => Promise<void> | void;
}

export interface MarketResearchCollectResult {
    items: NewMarketResearchItem[];
    sources: string[];
    errors: Array<{ source: string; message: string }>;
}

export interface MarketResearchProgressStats {
    stage: string;
    processed?: number;
    total?: number;
    hiraBaseCount?: number;
    hiraDetailProcessed?: number;
    equipmentProcessed?: number;
    deliveryCandidateCount?: number;
    naverProcessed?: number;
    inserted?: number;
    updated?: number;
    changed?: number;
    errors?: number;
    [key: string]: any;
}

const DEFAULT_SOURCES = [
    "HIRA 병원정보서비스",
    "HIRA 요양기관개폐업정보서비스",
    "행정안전부 지방행정 인허가/조회서비스",
    "보건복지부 산후조리원 현황",
    "KOSIS/주민등록 출생통계",
    "공식 홈페이지/SNS",
];

const HIRA_HOSPITAL_ENDPOINT = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const HIRA_DETAIL_ENDPOINT = "https://apis.data.go.kr/B551182/MadmDtlInfoService2.7";
const NAVER_LOCAL_SEARCH_ENDPOINT = "https://openapi.naver.com/v1/search/local.json";
const NAVER_MOBILE_SEARCH_ENDPOINT = "https://m.map.naver.com/search2/search.naver";
const NAVER_MOBILE_PLACE_ENDPOINT = "https://m.place.naver.com/place";
const NAVER_MAP_PLACE_URL_PREFIX = "https://map.naver.com/p/entry/place";
const OBGYN_DEPARTMENT_CODE = "10";
const PEDIATRICS_DEPARTMENT_CODE = "11";
const DEFAULT_HIRA_ROWS_PER_PAGE = 100;
const DEFAULT_HIRA_MAX_ROWS = 10000;
const DEFAULT_NAVER_LOCAL_LIMIT = 10000;
const DEFAULT_HIRA_DETAIL_LIMIT = 3000;
const DEFAULT_NAVER_DELAY_MS = 350;
const DEFAULT_NAVER_RETRY_DELAY_MS = 2000;
const DEFAULT_NAVER_MAX_RETRIES = 3;
const NAVER_OBGYN_CATEGORY = "병원,의원>산부인과";
const DETAIL_CANDIDATE_NAME_KEYWORDS = ["여성병원", "산부인과병원", "산부인과", "미즈", "우먼", "모아", "맘", "아이"];

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

interface HiraDetailRow {
    dgsbjtCd?: string;
    dgsbjtCdNm?: string;
    dgsbjtNm?: string;
    drCnt?: string;
    chrgDrCnt?: string;
    slctnDrCnt?: string;
    equipCd?: string;
    equipCdNm?: string;
    eqpCd?: string;
    eqpCdNm?: string;
    equipCnt?: string;
    eqpCnt?: string;
    [key: string]: string | undefined;
}

interface NaverLocalItem {
    title?: string;
    link?: string;
    category?: string;
    description?: string;
    telephone?: string;
    address?: string;
    roadAddress?: string;
    mapx?: string;
    mapy?: string;
}

interface NaverPlaceSearchItem {
    id?: string | number;
    name?: string;
    category?: string;
    address?: string;
    roadAddress?: string;
    tel?: string;
    latitude?: number | string;
    longitude?: number | string;
}

interface NaverPlaceLink {
    label: string;
    url: string;
    type: "homepage" | "blog" | "instagram" | "facebook" | "youtube" | "kakao" | "reservation" | "naver" | "other";
    source: "naver_local" | "naver_place";
}

interface NaverPlaceInfo {
    placeId: string | null;
    placeUrl: string | null;
    telephone?: string | null;
    links: NaverPlaceLink[];
}

interface DeliveryCandidateSignals {
    naverCategoryMatched: boolean;
    nameKeywordMatched: boolean;
    detailedResearchEligible: boolean;
    obgynDoctorCount: number;
    pediatricDoctorCount: number;
    incubatorCount: number;
    deliveryMonitorCount: number;
    score: number;
    grade: "strong_candidate" | "candidate" | "review" | "low_priority";
    evidence: string[];
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

function stripHtml(value: string | null | undefined): string {
    return (value || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function firstString(row: Record<string, string | undefined>, keys: string[]): string | null {
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return null;
}

function firstInt(row: Record<string, string | undefined>, keys: string[]): number | null {
    for (const key of keys) {
        const value = toInt(row[key]);
        if (value !== null) return value;
    }
    return null;
}

function getEnvInt(name: string, fallback: number): number {
    const parsed = parseInt(process.env[name] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reportProgress(options: MarketResearchCollectOptions, stats: MarketResearchProgressStats) {
    if (options.onProgress) await options.onProgress(stats);
}

function getRetryDelayMs(baseDelayMs: number, attempt: number): number {
    const exponential = baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * Math.min(500, Math.max(baseDelayMs, 1)));
    return exponential + jitter;
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

function parseHiraDetailItems(xml: string): HiraDetailRow[] {
    return parseHiraItems(xml) as HiraDetailRow[];
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

function buildHiraDetailUrl(serviceKey: string, operation: string, ykiho: string): string {
    const query = new URLSearchParams({ ykiho, pageNo: "1", numOfRows: "100" });
    return `${HIRA_DETAIL_ENDPOINT}/${operation}?ServiceKey=${buildPublicDataServiceKeyParam(serviceKey)}&${query.toString()}`;
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

function hasDetailCandidateNameKeyword(name: string | null | undefined): boolean {
    const normalized = normalizeText(name);
    return DETAIL_CANDIDATE_NAME_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function isNaverObgynCategory(category: string | null | undefined): boolean {
    return normalizeText(category).includes(normalizeText(NAVER_OBGYN_CATEGORY));
}

function getRawData(item: NewMarketResearchItem): Record<string, any> {
    return (item.rawData && typeof item.rawData === "object") ? item.rawData as Record<string, any> : {};
}

function normalizePhone(value: string | null | undefined): string {
    return String(value || "").replace(/[^0-9]/g, "");
}

function cleanUrl(value: string | null | undefined): string | null {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed, "https://m.place.naver.com");
        if (!["http:", "https:"].includes(url.protocol)) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function isNaverMapPlaceUrl(value: string | null | undefined): boolean {
    return String(value || "").includes("map.naver.com/p/entry/place/");
}

function classifyNaverPlaceLink(url: string, label: string): NaverPlaceLink["type"] {
    const normalizedUrl = url.toLowerCase();
    const normalizedLabel = normalizeText(label);
    if (normalizedUrl.includes("instagram.com") || normalizedLabel.includes("인스타")) return "instagram";
    if (normalizedUrl.includes("blog.naver.com") || normalizedUrl.includes("blog.me") || normalizedLabel.includes("블로그")) return "blog";
    if (normalizedUrl.includes("facebook.com") || normalizedLabel.includes("페이스북")) return "facebook";
    if (normalizedUrl.includes("youtube.com") || normalizedUrl.includes("youtu.be") || normalizedLabel.includes("유튜브")) return "youtube";
    if (normalizedUrl.includes("pf.kakao.com") || normalizedUrl.includes("kakao.com") || normalizedLabel.includes("카카오")) return "kakao";
    if (normalizedUrl.includes("booking.naver.com") || normalizedLabel.includes("예약")) return "reservation";
    if (normalizedUrl.includes("silson24.or.kr") || normalizedLabel.includes("서비스")) return "other";
    if (normalizedUrl.includes("naver.com") || normalizedUrl.includes("naver.me")) return "naver";
    return "homepage";
}

function isBusinessLink(url: string): boolean {
    const normalizedUrl = url.toLowerCase();
    if (normalizedUrl.includes("pstatic.net")) return false;
    if (normalizedUrl.includes("navercorp.com")) return false;
    if (normalizedUrl.includes("help.naver.com")) return false;
    if (normalizedUrl.includes("nid.naver.com")) return false;
    if (normalizedUrl.includes("m.place.naver.com") || normalizedUrl.includes("map.naver.com")) return false;
    if (normalizedUrl.includes("naver.com") || normalizedUrl.includes("naver.me")) {
        return normalizedUrl.includes("blog.naver.com")
            || normalizedUrl.includes("booking.naver.com")
            || normalizedUrl.includes("talk.naver.com")
            || normalizedUrl.includes("naver.me");
    }
    return true;
}

function dedupeNaverPlaceLinks(links: NaverPlaceLink[]): NaverPlaceLink[] {
    const seen = new Set<string>();
    const result: NaverPlaceLink[] = [];
    for (const link of links) {
        const key = link.url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(link);
    }
    return result;
}

function addNaverLink(links: NaverPlaceLink[], url: string | null, label: string, source: NaverPlaceLink["source"]) {
    if (!url || !isBusinessLink(url)) return;
    links.push({
        label: label || url,
        url,
        type: classifyNaverPlaceLink(url, label),
        source,
    });
}

function getPreferredWebsiteLink(links: NaverPlaceLink[], naverLocalLink: string | null): string | null {
    const localLink = cleanUrl(naverLocalLink);
    if (localLink && isBusinessLink(localLink)) return localLink;
    return links.find((link) => link.type === "homepage" && normalizeText(link.label).includes("홈페이지"))?.url
        || links.find((link) => link.type === "blog")?.url
        || links.find((link) => link.type === "homepage")?.url
        || links.find((link) => link.type === "naver")?.url
        || null;
}

function getPreferredTypedLink(links: NaverPlaceLink[], type: NaverPlaceLink["type"]): string | null {
    return links.find((link) => link.type === type)?.url || null;
}

function extractNaverPlaceLinks(html: string, naverLocalLink: string | null): NaverPlaceLink[] {
    const links: NaverPlaceLink[] = [];
    addNaverLink(links, cleanUrl(naverLocalLink), "대표 링크", "naver_local");

    const $ = cheerio.load(html);
    $("a[href]").each((_, element) => {
        const href = cleanUrl($(element).attr("href"));
        const label = stripHtml($(element).text()).replace(/\s+/g, " ").trim();
        addNaverLink(links, href, label, "naver_place");
    });

    return dedupeNaverPlaceLinks(links);
}

function getHiraYkiho(item: NewMarketResearchItem): string | null {
    const rawData = getRawData(item);
    return rawData.hira?.ykiho || rawData.hiraYkiho || null;
}

function businessTypeAllowed(businessType: BusinessType, requestedTypes: string[] | undefined): boolean {
    if (!requestedTypes || requestedTypes.length === 0) return true;
    if (requestedTypes.includes("obgyn") && ["obgyn", "delivery_hospital", "general_obgyn", "women_hospital"].includes(businessType)) return true;
    return requestedTypes.includes(businessType);
}

function marketResearchBusinessTypeAllowed(item: NewMarketResearchItem, requestedTypes: string[] | undefined): boolean {
    if (!requestedTypes || requestedTypes.length === 0) return true;
    if (requestedTypes.includes("obgyn") && ["obgyn", "delivery_hospital", "general_obgyn", "women_hospital"].includes(String(item.businessType))) return true;
    if (requestedTypes.includes("delivery_hospital")) {
        const isDeliveryCandidate = !!item.isDeliveryHospital || (getRawData(item).deliveryCandidate?.score || 0) >= 3;
        if (isDeliveryCandidate) return true;
        if (requestedTypes.length === 1) return false;
    }
    return businessTypeAllowed(item.businessType as BusinessType, requestedTypes);
}

function operationStatusAllowed(operationStatus: OperationStatus, requestedStatuses: string[] | undefined): boolean {
    return !requestedStatuses || requestedStatuses.length === 0 || requestedStatuses.includes(operationStatus);
}

function regionAllowed(item: NewMarketResearchItem, requestedRegions: string[] | undefined): boolean {
    if (!requestedRegions || requestedRegions.length === 0 || requestedRegions.includes("전국")) return true;
    return requestedRegions.includes(String(item.region)) || requestedRegions.includes(String(item.city));
}

function calculateMarketScore(item: Partial<NewMarketResearchItem>): number {
    const deliveryCandidateScore = (item.rawData as any)?.deliveryCandidate?.score || 0;
    let score = item.businessType === "delivery_hospital" ? 78 : item.businessType === "women_hospital" ? 74 : 62;
    if (item.website) score += 5;
    if (item.phone) score += 3;
    if ((item.totalDoctorCount || 0) >= 5) score += 6;
    if ((item.totalDoctorCount || 0) >= 10) score += 4;
    if (item.hasDeliveryCenter) score += 5;
    if (deliveryCandidateScore >= 3) score += 8;
    else if (deliveryCandidateScore === 2) score += 4;
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
    const doctorCounts: Record<string, number> = {};
    const partial: Partial<NewMarketResearchItem> = {
        businessType,
        phone: null,
        website: null,
        totalDoctorCount,
        hasDeliveryCenter: false,
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
        phone: null,
        email: null,
        website: null,
        isNew: false,
        hasUpdates: false,
        isSelected: false,
        isDeliveryHospital: false,
        deliveryCountYear: null,
        deliveryCount: null,
        deliveryCountSource: "HIRA 병원정보서비스에는 분만 건수가 없어 확인 필요",
        medicalDepartments,
        doctorCounts,
        totalDoctorCount,
        hasDeliveryCenter: false,
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
        sourceUrls: [],
        sourceConfidence: "official",
        verificationStatus: "auto_collected",
        rawData: {
            hira: row,
            hiraYkiho: row.ykiho || null,
            hiraPhone: row.telno || null,
            hiraWebsite: row.hospUrl || null,
        },
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
    const yadmNm = options.queryName || process.env.MARKET_RESEARCH_HIRA_QUERY_NAME;
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
                yadmNm,
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

function naverMatchScore(item: NewMarketResearchItem, naverItem: NaverLocalItem): number {
    const itemName = normalizeText(item.name);
    const itemAddress = normalizeText(item.address);
    const naverTitle = normalizeText(stripHtml(naverItem.title));
    const naverAddress = normalizeText(`${naverItem.roadAddress || ""} ${naverItem.address || ""}`);
    let score = 0;

    if (naverTitle === itemName) score += 8;
    else if (naverTitle.includes(itemName) || itemName.includes(naverTitle)) score += 5;
    if (item.district && naverAddress.includes(normalizeText(item.district))) score += 2;
    if (item.region && naverAddress.includes(normalizeText(item.region))) score += 1;
    if (itemAddress && naverAddress && (itemAddress.includes(naverAddress.slice(0, 12)) || naverAddress.includes(itemAddress.slice(0, 12)))) score += 2;
    if (isNaverObgynCategory(naverItem.category)) score += 2;

    return score;
}

function naverPlaceSearchScore(item: NewMarketResearchItem, place: NaverPlaceSearchItem): number {
    const itemName = normalizeText(item.name);
    const itemAddress = normalizeText(item.address);
    const placeName = normalizeText(place.name);
    const placeAddress = normalizeText(`${place.roadAddress || ""} ${place.address || ""}`);
    const itemPhone = normalizePhone(item.phone);
    const placePhone = normalizePhone(place.tel);
    let score = 0;

    if (placeName === itemName) score += 8;
    else if (placeName.includes(itemName) || itemName.includes(placeName)) score += 5;
    if (item.district && placeAddress.includes(normalizeText(item.district))) score += 2;
    if (item.region && placeAddress.includes(normalizeText(item.region))) score += 1;
    if (itemAddress && placeAddress && (itemAddress.includes(placeAddress.slice(0, 12)) || placeAddress.includes(itemAddress.slice(0, 12)))) score += 2;
    if (itemPhone && placePhone && (itemPhone === placePhone || itemPhone.endsWith(placePhone.slice(-8)) || placePhone.endsWith(itemPhone.slice(-8)))) score += 3;
    if (normalizeText(place.category).includes("산부인과")) score += 2;

    return score;
}

function collectNaverSearchItems(value: unknown, result: NaverPlaceSearchItem[] = []): NaverPlaceSearchItem[] {
    if (!value || typeof value !== "object") return result;
    if (Array.isArray(value)) {
        for (const item of value) collectNaverSearchItems(item, result);
        return result;
    }

    const record = value as Record<string, unknown>;
    if (
        (typeof record.id === "number" || typeof record.id === "string")
        && typeof record.name === "string"
        && (typeof record.address === "string" || typeof record.roadAddress === "string")
    ) {
        result.push(record as NaverPlaceSearchItem);
    }

    for (const child of Object.values(record)) {
        if (child && typeof child === "object") collectNaverSearchItems(child, result);
    }
    return result;
}

function parseNaverMobileSearchItems(html: string): NaverPlaceSearchItem[] {
    const items: NaverPlaceSearchItem[] = [];
    const scriptRegex = /window\.__RQ_STREAMING_STATE__\.push\(([\s\S]*?)\);\s*window\.__RQ_STREAMING_CALLBACK__/g;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            collectNaverSearchItems(JSON.parse(match[1]), items);
        } catch {
            // Ignore unrelated streaming chunks.
        }
    }
    return dedupeNaverSearchItems(items);
}

function dedupeNaverSearchItems(items: NaverPlaceSearchItem[]): NaverPlaceSearchItem[] {
    const seen = new Set<string>();
    const result: NaverPlaceSearchItem[] = [];
    for (const item of items) {
        const id = item.id ? String(item.id) : "";
        const key = id || [item.name, item.roadAddress || item.address, item.tel].map((value) => normalizeText(String(value || ""))).join("|");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

function naverLocalCoord(value: string | null | undefined): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.abs(parsed) > 1000 ? parsed / 10000000 : parsed;
}

function getNaverSearchCoord(item: NewMarketResearchItem, naverItem?: NaverLocalItem | null): string {
    const naverLongitude = naverLocalCoord(naverItem?.mapx);
    const naverLatitude = naverLocalCoord(naverItem?.mapy);
    if (naverLongitude && naverLatitude) return `${naverLongitude};${naverLatitude}`;

    const longitude = Number(item.longitude);
    const latitude = Number(item.latitude);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return `${longitude};${latitude}`;
    return "127.027619;37.497952";
}

async function searchNaverPlace(item: NewMarketResearchItem, naverItem?: NaverLocalItem | null): Promise<NaverPlaceSearchItem | null> {
    let bestMatch: { place: NaverPlaceSearchItem; score: number } | null = null;
    for (const query of buildNaverLocalQueries(item)) {
        const params = new URLSearchParams({
            query,
            sm: "hty",
            style: "v5",
            searchCoord: getNaverSearchCoord(item, naverItem),
        });
        const response = await fetch(`${NAVER_MOBILE_SEARCH_ENDPOINT}?${params.toString()}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
                "Referer": "https://m.map.naver.com/",
                "Accept": "text/html,application/xhtml+xml",
            },
        });
        if (!response.ok) continue;

        const html = await response.text();
        const match = parseNaverMobileSearchItems(html)
            .map((place) => ({ place, score: naverPlaceSearchScore(item, place) }))
            .sort((a, b) => b.score - a.score)[0] || null;

        if (!match) continue;
        if (!bestMatch || match.score > bestMatch.score) bestMatch = match;
        if (match.score >= 10) break;
    }

    if (!bestMatch?.place.id || (bestMatch?.score || 0) < 7) return null;
    return bestMatch.place;
}

async function fetchNaverPlaceInfo(item: NewMarketResearchItem, naverItem: NaverLocalItem | null): Promise<NaverPlaceInfo> {
    const place = await searchNaverPlace(item, naverItem);
    const placeId = place?.id ? String(place.id) : null;
    const placeUrl = placeId ? `${NAVER_MAP_PLACE_URL_PREFIX}/${placeId}` : null;
    const localLink = cleanUrl(naverItem?.link);

    if (!placeId) {
        return {
            placeId: null,
            placeUrl: null,
            telephone: null,
            links: dedupeNaverPlaceLinks(localLink ? [{
                label: "대표 링크",
                url: localLink,
                type: classifyNaverPlaceLink(localLink, "대표 링크"),
                source: "naver_local",
            }] : []),
        };
    }

    const response = await fetch(`${NAVER_MOBILE_PLACE_ENDPOINT}/${placeId}/home`, {
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
            "Referer": "https://m.place.naver.com/",
            "Accept": "text/html,application/xhtml+xml",
        },
    });
    const html = response.ok ? await response.text() : "";

    return {
        placeId,
        placeUrl,
        telephone: stripHtml(place?.tel) || null,
        links: extractNaverPlaceLinks(html, localLink),
    };
}

function buildNaverLocalQueries(item: NewMarketResearchItem): string[] {
    const addressParts = String(item.address || "").split(/\s+/).filter(Boolean);
    const shortAddress = addressParts.slice(0, 3).join(" ");
    const queries = [
        [item.district || item.city || item.region, item.name].filter(Boolean).join(" "),
        [item.name, shortAddress].filter(Boolean).join(" "),
        String(item.name || ""),
    ];
    return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

async function fetchNaverLocalCandidates(
    query: string,
    clientId: string,
    clientSecret: string,
    maxRetries: number,
    retryDelayMs: number,
): Promise<NaverLocalItem[]> {
    const params = new URLSearchParams({
        query,
        display: "5",
        start: "1",
        sort: "random",
    });

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(`${NAVER_LOCAL_SEARCH_ENDPOINT}?${params.toString()}`, {
            headers: {
                "X-Naver-Client-Id": clientId,
                "X-Naver-Client-Secret": clientSecret,
            },
        });

        if (response.ok) {
            const data = await response.json() as { items?: NaverLocalItem[] };
            return data.items || [];
        }

        const text = await response.text();
        lastError = new Error(`Naver Local HTTP ${response.status}: ${text.slice(0, 200)}`);
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= maxRetries) break;
        await sleep(getRetryDelayMs(retryDelayMs, attempt));
    }
    throw lastError || new Error("Naver Local 검색 실패");
}

async function searchNaverLocal(
    item: NewMarketResearchItem,
    clientId: string,
    clientSecret: string,
    maxRetries = DEFAULT_NAVER_MAX_RETRIES,
    retryDelayMs = DEFAULT_NAVER_RETRY_DELAY_MS,
): Promise<NaverLocalItem | null> {
    let bestMatch: { naverItem: NaverLocalItem; score: number } | null = null;
    for (const query of buildNaverLocalQueries(item)) {
        const candidates = await fetchNaverLocalCandidates(query, clientId, clientSecret, maxRetries, retryDelayMs);
        const match = candidates
            .map((naverItem) => ({ naverItem, score: naverMatchScore(item, naverItem) }))
            .sort((a, b) => b.score - a.score)[0] || null;

        if (!match) continue;
        if (!bestMatch || match.score > bestMatch.score) bestMatch = match;
        if (match.score >= 8 || isNaverObgynCategory(match.naverItem.category)) return match.naverItem;
    }
    return bestMatch?.naverItem || null;
}

function mergeNaverLocal(item: NewMarketResearchItem, naverItem: NaverLocalItem | null, placeInfo: NaverPlaceInfo | null = null): NewMarketResearchItem {
    const rawData = getRawData(item);
    const category = stripHtml(naverItem?.category);
    const naverCategoryMatched = isNaverObgynCategory(category);
    const nameKeywordMatched = !!rawData.nameKeywordMatched || hasDetailCandidateNameKeyword(item.name);
    const detailedResearchEligible = !!rawData.detailedResearchEligible || naverCategoryMatched || nameKeywordMatched;
    const naverTitle = stripHtml(naverItem?.title);
    const naverLink = cleanUrl(naverItem?.link);
    const naverTelephone = placeInfo?.telephone || stripHtml(naverItem?.telephone);
    const naverPlaceLinks = dedupeNaverPlaceLinks(placeInfo?.links || (naverLink ? [{
        label: "대표 링크",
        url: naverLink,
        type: classifyNaverPlaceLink(naverLink, "대표 링크"),
        source: "naver_local" as const,
    }] : []));
    const website = getPreferredWebsiteLink(naverPlaceLinks, naverLink);
    const blog = getPreferredTypedLink(naverPlaceLinks, "blog");
    const instagram = getPreferredTypedLink(naverPlaceLinks, "instagram");
    const sourceUrls = Array.from(new Set([...(item.sourceUrls || []), placeInfo?.placeUrl, website, blog, instagram].filter(Boolean) as string[]));
    const sources = Array.from(new Set([...(item.sources || []), "네이버 지역검색"]));
    const deliveryCandidate = rawData.deliveryCandidate
        ? {
            ...rawData.deliveryCandidate,
            naverCategoryMatched,
            nameKeywordMatched,
            detailedResearchEligible,
        }
        : rawData.deliveryCandidate;

    return {
        ...item,
        phone: naverTelephone || item.phone || null,
        website: website || item.website || null,
        blog: blog || item.blog || null,
        instagram: instagram || item.instagram || null,
        sources,
        sourceUrls,
        rawData: {
            ...rawData,
            naverPlaceId: placeInfo?.placeId || rawData.naverPlaceId || null,
            naverPlaceUrl: placeInfo?.placeUrl || (isNaverMapPlaceUrl(rawData.naverPlaceUrl) ? rawData.naverPlaceUrl : null),
            naverPlaceLinks,
            naverLocal: naverItem ? {
                title: naverTitle,
                link: naverLink,
                category,
                address: stripHtml(naverItem.address),
                roadAddress: stripHtml(naverItem.roadAddress),
                mapx: naverItem.mapx || null,
                mapy: naverItem.mapy || null,
            } : null,
            naverCategoryMatched,
            nameKeywordMatched,
            detailedResearchEligible,
            deliveryCandidate,
        },
    };
}

export async function enrichMarketResearchItemWithNaverInfo(
    item: NewMarketResearchItem,
    clientId = process.env.NAVER_CLIENT_ID,
    clientSecret = process.env.NAVER_CLIENT_SECRET,
): Promise<{ item: NewMarketResearchItem; errors: Array<{ source: string; message: string }> }> {
    const errors: Array<{ source: string; message: string }> = [];
    let naverItem: NaverLocalItem | null = null;

    if (clientId && clientSecret) {
        try {
            naverItem = await searchNaverLocal(item, clientId, clientSecret);
        } catch (error: any) {
            errors.push({ source: "네이버 지역검색", message: `${item.name}: ${error?.message || "지역검색 조회 실패"}` });
        }
    } else {
        errors.push({ source: "네이버 지역검색", message: "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없어 공식 지역검색 link 조회는 건너뛰었습니다." });
    }

    try {
        const placeInfo = await fetchNaverPlaceInfo(item, naverItem);
        return { item: mergeNaverLocal(item, naverItem, placeInfo), errors };
    } catch (error: any) {
        errors.push({ source: "네이버 플레이스", message: `${item.name}: ${error?.message || "플레이스 상세 조회 실패"}` });
        return { item: mergeNaverLocal(item, naverItem, null), errors };
    }
}

async function enrichWithNaverLocal(items: NewMarketResearchItem[], clientId: string | undefined, clientSecret: string | undefined): Promise<MarketResearchCollectResult> {
    const limit = Math.min(getEnvInt("MARKET_RESEARCH_NAVER_LOCAL_LIMIT", DEFAULT_NAVER_LOCAL_LIMIT), items.length);
    const delayMs = getEnvInt("MARKET_RESEARCH_NAVER_DELAY_MS", DEFAULT_NAVER_DELAY_MS);
    const retryDelayMs = getEnvInt("MARKET_RESEARCH_NAVER_RETRY_DELAY_MS", DEFAULT_NAVER_RETRY_DELAY_MS);
    const maxRetries = getEnvInt("MARKET_RESEARCH_NAVER_MAX_RETRIES", DEFAULT_NAVER_MAX_RETRIES);
    const errors: MarketResearchCollectResult["errors"] = [];
    const enriched: NewMarketResearchItem[] = [];

    if (!clientId || !clientSecret) {
        return {
            items: items.map((item) => mergeNaverLocal(item, null)),
            sources: [],
            errors: items.length > 0 ? [{ source: "네이버 지역검색", message: "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없어 네이버 카테고리 필터는 기관명 키워드 예외만 적용했습니다." }] : [],
        };
    }

    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (index >= limit) {
            enriched.push(mergeNaverLocal(item, null));
            continue;
        }
        try {
            if (index > 0 && delayMs > 0) await sleep(delayMs);
            const naverItem = await searchNaverLocal(item, clientId, clientSecret, maxRetries, retryDelayMs);
            let placeInfo: NaverPlaceInfo | null = null;
            try {
                placeInfo = await fetchNaverPlaceInfo(item, naverItem);
            } catch (error: any) {
                errors.push({ source: "네이버 플레이스", message: `${item.name}: ${error?.message || "플레이스 상세 조회 실패"}` });
            }
            enriched.push(mergeNaverLocal(item, naverItem, placeInfo));
        } catch (error: any) {
            errors.push({ source: "네이버 지역검색", message: `${item.name}: ${error?.message || "카테고리 조회 실패"}` });
            enriched.push(mergeNaverLocal(item, null));
        }
    }

    if (limit < items.length) {
        errors.push({ source: "네이버 지역검색", message: `네이버 조회 상한 ${limit}건에 도달해 이후 항목은 기관명 키워드 예외만 적용했습니다. MARKET_RESEARCH_NAVER_LOCAL_LIMIT로 조정 가능합니다.` });
    }

    return {
        items: enriched,
        sources: limit > 0 ? ["네이버 지역검색"] : [],
        errors,
    };
}

async function enrichDeliveryCandidatesWithNaverLocal(items: NewMarketResearchItem[], clientId: string | undefined, clientSecret: string | undefined, options: MarketResearchCollectOptions): Promise<MarketResearchCollectResult> {
    const deliveryCandidates = items.filter(isFinalDeliveryCandidate);
    const limit = Math.min(getEnvInt("MARKET_RESEARCH_NAVER_LOCAL_LIMIT", DEFAULT_NAVER_LOCAL_LIMIT), deliveryCandidates.length);
    const delayMs = getEnvInt("MARKET_RESEARCH_NAVER_DELAY_MS", DEFAULT_NAVER_DELAY_MS);
    const retryDelayMs = getEnvInt("MARKET_RESEARCH_NAVER_RETRY_DELAY_MS", DEFAULT_NAVER_RETRY_DELAY_MS);
    const maxRetries = getEnvInt("MARKET_RESEARCH_NAVER_MAX_RETRIES", DEFAULT_NAVER_MAX_RETRIES);
    const errors: MarketResearchCollectResult["errors"] = [];
    const enrichedByKey = new Map<string, NewMarketResearchItem>();

    await reportProgress(options, {
        stage: "naver_enrichment",
        processed: 0,
        total: limit,
        deliveryCandidateCount: deliveryCandidates.length,
        naverProcessed: 0,
        errors: 0,
    });

    if (!clientId || !clientSecret) {
        return {
            items,
            sources: [],
            errors: deliveryCandidates.length > 0 ? [{ source: "네이버 지역검색", message: "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없어 분만산부인과 후보 네이버 보강을 건너뛰었습니다." }] : [],
        };
    }

    for (let index = 0; index < deliveryCandidates.length; index++) {
        const item = deliveryCandidates[index];
        const key = item.stableKey || buildStableKey(item.name, item.address, item.phone);
        if (index >= limit) {
            enrichedByKey.set(key, {
                ...item,
                rawData: {
                    ...getRawData(item),
                    naverSkippedReason: `네이버 조회 상한 ${limit}건 초과`,
                },
            });
            continue;
        }

        try {
            if (index > 0 && delayMs > 0) await sleep(delayMs);
            const naverItem = await searchNaverLocal(item, clientId, clientSecret, maxRetries, retryDelayMs);
            let placeInfo: NaverPlaceInfo | null = null;
            try {
                placeInfo = await fetchNaverPlaceInfo(item, naverItem);
            } catch (error: any) {
                errors.push({ source: "네이버 플레이스", message: `${item.name}: ${error?.message || "플레이스 상세 조회 실패"}` });
            }
            enrichedByKey.set(key, mergeNaverLocal(item, naverItem, placeInfo));
        } catch (error: any) {
            errors.push({ source: "네이버 지역검색", message: `${item.name}: ${error?.message || "카테고리 조회 실패"}` });
            enrichedByKey.set(key, mergeNaverLocal(item, null));
        }

        const processed = Math.min(index + 1, limit);
        if (processed % 10 === 0 || processed === limit) {
            await reportProgress(options, {
                stage: "naver_enrichment",
                processed,
                total: limit,
                deliveryCandidateCount: deliveryCandidates.length,
                naverProcessed: processed,
                errors: errors.length,
            });
        }
    }

    if (limit < deliveryCandidates.length) {
        errors.push({ source: "네이버 지역검색", message: `네이버 조회 상한 ${limit}건에 도달해 이후 분만산부인과 후보는 HIRA 기준으로만 유지했습니다. MARKET_RESEARCH_NAVER_LOCAL_LIMIT로 조정 가능합니다.` });
    }

    return {
        items: items.map((item) => {
            const key = item.stableKey || buildStableKey(item.name, item.address, item.phone);
            return enrichedByKey.get(key) || item;
        }),
        sources: limit > 0 ? ["네이버 지역검색"] : [],
        errors,
    };
}

async function fetchHiraDetailRows(serviceKey: string, operation: string, ykiho: string): Promise<HiraDetailRow[]> {
    const response = await fetch(buildHiraDetailUrl(serviceKey, operation, ykiho));
    const xml = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${xml.slice(0, 200)}`);

    const message = getHiraResultMessage(xml);
    if (message) throw new Error(message);

    return parseHiraDetailItems(xml);
}

function departmentName(row: HiraDetailRow): string | null {
    return firstString(row, ["dgsbjtCdNm", "dgsbjtNm", "dgsbjtName", "subjectName", "sbjNm"]);
}

function departmentCode(row: HiraDetailRow): string | null {
    return firstString(row, ["dgsbjtCd", "dsbjtCd", "subjectCd", "sbjCd"]);
}

function departmentDoctorCount(row: HiraDetailRow): number {
    const explicit = firstInt(row, ["dtlSdrCnt", "dgsbjtPrSdrCnt", "drCnt", "chrgDrCnt", "doctorCnt", "mdeptSdrCnt", "sdrCnt", "spclDrCnt"]);
    if (explicit !== null) return explicit;

    const countValues = Object.entries(row)
        .filter(([key]) => /cnt$/i.test(key) && !/(slct|select|choice|choi|nurs|grade|room|bed)/i.test(key))
        .map(([, value]) => toInt(value))
        .filter((value): value is number => value !== null);
    return countValues.length > 0 ? Math.max(...countValues) : 0;
}

function equipmentName(row: HiraDetailRow): string | null {
    return firstString(row, ["oftCdNm", "equipCdNm", "eqpCdNm", "equipNm", "eqpNm", "equipmentName"]);
}

function equipmentCount(row: HiraDetailRow): number {
    return firstInt(row, ["oftCnt", "equipCnt", "eqpCnt", "ownCnt", "hldCnt", "cnt"]) || 0;
}

function summarizeDepartments(rows: HiraDetailRow[]): {
    departments: string[];
    doctorCounts: Record<string, number>;
    obgynDoctorCount: number;
    pediatricDoctorCount: number;
} {
    const departments: string[] = [];
    const doctorCounts: Record<string, number> = {};
    let obgynDoctorCount = 0;
    let pediatricDoctorCount = 0;

    for (const row of rows) {
        const name = departmentName(row);
        if (!name) continue;
        const code = departmentCode(row);
        const count = departmentDoctorCount(row);
        departments.push(name);
        doctorCounts[name] = count;

        const normalized = normalizeText(name);
        if (code === OBGYN_DEPARTMENT_CODE || normalized.includes("산부인과")) obgynDoctorCount = Math.max(obgynDoctorCount, count);
        if (code === PEDIATRICS_DEPARTMENT_CODE || normalized.includes("소아청소년과") || normalized.includes("소아과")) pediatricDoctorCount = Math.max(pediatricDoctorCount, count);
    }

    return {
        departments: Array.from(new Set(departments)),
        doctorCounts,
        obgynDoctorCount,
        pediatricDoctorCount,
    };
}

function summarizeEquipment(rows: HiraDetailRow[]): { incubatorCount: number; deliveryMonitorCount: number } {
    let incubatorCount = 0;
    let deliveryMonitorCount = 0;

    for (const row of rows) {
        const name = equipmentName(row);
        if (!name) continue;
        const normalized = normalizeText(name);
        const count = equipmentCount(row);
        if (normalized.includes("인큐베이터") || normalized.includes("incubator")) incubatorCount += count;
        if (normalized.includes("분만감시기")) deliveryMonitorCount += count;
    }

    return { incubatorCount, deliveryMonitorCount };
}

function buildDeliveryCandidateSignals(item: NewMarketResearchItem, departments: ReturnType<typeof summarizeDepartments>, equipment: ReturnType<typeof summarizeEquipment>): DeliveryCandidateSignals {
    const rawData = getRawData(item);
    const naverCategoryMatched = !!rawData.naverCategoryMatched;
    const nameKeywordMatched = !!rawData.nameKeywordMatched;
    const detailedResearchEligible = !!rawData.detailedResearchEligible;
    const evidence: string[] = [];
    let score = 0;

    if (departments.obgynDoctorCount >= 3) {
        score++;
        evidence.push(`산부인과 의사 ${departments.obgynDoctorCount}명`);
    }
    if (departments.pediatricDoctorCount > 0) {
        score++;
        evidence.push(`소아청소년과 의사 ${departments.pediatricDoctorCount}명`);
    }
    if (equipment.incubatorCount > 0) {
        score++;
        evidence.push(`인큐베이터 ${equipment.incubatorCount}대`);
    }
    if (equipment.deliveryMonitorCount > 0) {
        score++;
        evidence.push(`분만감시기 ${equipment.deliveryMonitorCount}대`);
    }

    const grade: DeliveryCandidateSignals["grade"] =
        score >= 4 ? "strong_candidate" :
        score === 3 ? "candidate" :
        score === 2 ? "review" :
        "low_priority";

    return {
        naverCategoryMatched,
        nameKeywordMatched,
        detailedResearchEligible,
        obgynDoctorCount: departments.obgynDoctorCount,
        pediatricDoctorCount: departments.pediatricDoctorCount,
        incubatorCount: equipment.incubatorCount,
        deliveryMonitorCount: equipment.deliveryMonitorCount,
        score,
        grade,
        evidence,
    };
}

function applyHiraDetailSignals(item: NewMarketResearchItem, departmentRows: HiraDetailRow[], equipmentRows: HiraDetailRow[]): NewMarketResearchItem {
    const departmentSummary = summarizeDepartments(departmentRows);
    const equipmentSummary = summarizeEquipment(equipmentRows);
    const deliveryCandidate = buildDeliveryCandidateSignals(item, departmentSummary, equipmentSummary);
    const isDeliveryHospital = deliveryCandidate.score >= 3;
    const businessType: BusinessType = isDeliveryHospital
        ? "delivery_hospital"
        : item.businessType === "delivery_hospital"
            ? (normalizeText(item.name).includes("여성병원") ? "women_hospital" : "general_obgyn")
            : item.businessType as BusinessType;
    const rawData = {
        ...getRawData(item),
        hiraDepartments: departmentRows,
        hiraEquipment: equipmentRows,
        deliveryCandidate,
    };
    const nextItem: NewMarketResearchItem = {
        ...item,
        businessType,
        isDeliveryHospital,
        hasDeliveryCenter: isDeliveryHospital || equipmentSummary.deliveryMonitorCount > 0,
        hasPediatricLink: departmentSummary.pediatricDoctorCount > 0,
        medicalDepartments: departmentSummary.departments.length > 0 ? departmentSummary.departments : item.medicalDepartments,
        doctorCounts: { ...(item.doctorCounts || {}), ...departmentSummary.doctorCounts },
        deliveryCountSource: `HIRA 상세정보 기준 ${deliveryCandidate.score}/4 충족${deliveryCandidate.evidence.length > 0 ? `: ${deliveryCandidate.evidence.join(", ")}` : ""}`,
        sourceConfidence: isDeliveryHospital ? "official" : item.sourceConfidence,
        rawData,
    };
    const marketScore = calculateMarketScore(nextItem);
    return {
        ...nextItem,
        marketScore,
        priorityGrade: priorityGrade(marketScore),
    };
}

function firstStageScoreFromDepartments(departments: ReturnType<typeof summarizeDepartments>): number {
    return (departments.obgynDoctorCount >= 3 ? 1 : 0) + (departments.pediatricDoctorCount > 0 ? 1 : 0);
}

function isEquipmentResearchCandidate(item: NewMarketResearchItem): boolean {
    const deliveryCandidate = getRawData(item).deliveryCandidate;
    const firstStageScore =
        (deliveryCandidate?.obgynDoctorCount >= 3 ? 1 : 0)
        + (deliveryCandidate?.pediatricDoctorCount > 0 ? 1 : 0);
    return firstStageScore > 0;
}

function isFinalDeliveryCandidate(item: NewMarketResearchItem): boolean {
    return !!item.isDeliveryHospital || (getRawData(item).deliveryCandidate?.score || 0) >= 3;
}

function applyHiraDepartmentSignals(item: NewMarketResearchItem, departmentRows: HiraDetailRow[]): NewMarketResearchItem {
    const departmentSummary = summarizeDepartments(departmentRows);
    const equipmentSummary = { incubatorCount: 0, deliveryMonitorCount: 0 };
    const deliveryCandidate = buildDeliveryCandidateSignals(item, departmentSummary, equipmentSummary);
    const firstStageScore = firstStageScoreFromDepartments(departmentSummary);
    const rawData = getRawData(item);
    const nameKeywordMatched = !!rawData.nameKeywordMatched || hasDetailCandidateNameKeyword(item.name);
    const detailedResearchEligible = firstStageScore > 0 || nameKeywordMatched || !!rawData.detailedResearchEligible;
    const nextDeliveryCandidate = {
        ...deliveryCandidate,
        nameKeywordMatched,
        detailedResearchEligible,
    };
    const nextItem: NewMarketResearchItem = {
        ...item,
        hasPediatricLink: departmentSummary.pediatricDoctorCount > 0,
        medicalDepartments: departmentSummary.departments.length > 0 ? departmentSummary.departments : item.medicalDepartments,
        doctorCounts: { ...(item.doctorCounts || {}), ...departmentSummary.doctorCounts },
        deliveryCountSource: `HIRA 진료과/전문의 기준 1차 ${firstStageScore}/2 충족${nextDeliveryCandidate.evidence.length > 0 ? `: ${nextDeliveryCandidate.evidence.join(", ")}` : ""}`,
        rawData: {
            ...rawData,
            hiraDepartments: departmentRows,
            nameKeywordMatched,
            detailedResearchEligible,
            deliveryCandidate: nextDeliveryCandidate,
        },
    };
    const marketScore = calculateMarketScore(nextItem);
    return {
        ...nextItem,
        marketScore,
        priorityGrade: priorityGrade(marketScore),
    };
}

async function enrichWithHiraDepartmentDetails(items: NewMarketResearchItem[], serviceKey: string, options: MarketResearchCollectOptions): Promise<MarketResearchCollectResult> {
    const errors: MarketResearchCollectResult["errors"] = [];
    const limit = getEnvInt("MARKET_RESEARCH_HIRA_DETAIL_LIMIT", DEFAULT_HIRA_DETAIL_LIMIT);
    const total = Math.min(items.filter((item) => !!getHiraYkiho(item)).length, limit);
    const enriched: NewMarketResearchItem[] = [];
    let detailedCount = 0;
    let repeatedDetailFailureCount = 0;

    await reportProgress(options, { stage: "hira_departments", processed: 0, total, hiraDetailProcessed: 0, errors: 0 });

    for (const item of items) {
        const ykiho = getHiraYkiho(item);
        if (!ykiho || detailedCount >= limit || repeatedDetailFailureCount >= 5) {
            enriched.push(item);
            continue;
        }

        try {
            const departmentRows = await fetchHiraDetailRows(serviceKey, "getSpcSbjtSdrInfo2.7", ykiho);
            detailedCount++;
            repeatedDetailFailureCount = 0;
            enriched.push(applyHiraDepartmentSignals(item, departmentRows));
        } catch (error: any) {
            detailedCount++;
            repeatedDetailFailureCount++;
            if (errors.length < 20) {
                errors.push({ source: "HIRA 진료과/전문의 상세정보", message: `${item.name}: ${error?.message || "진료과/전문의 조회 실패"}` });
            }
            enriched.push(item);
        }

        if (detailedCount % 25 === 0 || detailedCount === total) {
            await reportProgress(options, {
                stage: "hira_departments",
                processed: detailedCount,
                total,
                hiraDetailProcessed: detailedCount,
                errors: errors.length,
            });
        }
    }

    if (detailedCount >= limit && items.filter((item) => !!getHiraYkiho(item)).length > limit) {
        errors.push({ source: "HIRA 진료과/전문의 상세정보", message: `상세조사 상한 ${limit}건에 도달했습니다. MARKET_RESEARCH_HIRA_DETAIL_LIMIT로 조정 가능합니다.` });
    }
    if (repeatedDetailFailureCount >= 5) {
        errors.push({ source: "HIRA 진료과/전문의 상세정보", message: "상세정보 API 연속 실패가 발생해 남은 진료과/전문의 조회를 중단했습니다. 의료기관별상세정보서비스 활용신청 또는 인증키 권한을 확인해야 합니다." });
    }

    return {
        items: enriched,
        sources: detailedCount > 0 ? ["HIRA 의료기관별상세정보서비스:진료과/전문의"] : [],
        errors,
    };
}

async function enrichWithHiraEquipmentDetails(items: NewMarketResearchItem[], serviceKey: string, options: MarketResearchCollectOptions): Promise<MarketResearchCollectResult> {
    const errors: MarketResearchCollectResult["errors"] = [];
    const limit = getEnvInt("MARKET_RESEARCH_HIRA_DETAIL_LIMIT", DEFAULT_HIRA_DETAIL_LIMIT);
    const eligibleItems = items.filter((item) => !!getHiraYkiho(item) && isEquipmentResearchCandidate(item));
    const total = Math.min(eligibleItems.length, limit);
    const eligibleKeys = new Set(eligibleItems.slice(0, limit).map((item) => item.stableKey || buildStableKey(item.name, item.address, item.phone)));
    const enriched: NewMarketResearchItem[] = [];
    let equipmentCount = 0;
    let repeatedDetailFailureCount = 0;

    await reportProgress(options, { stage: "hira_equipment", processed: 0, total, equipmentProcessed: 0, deliveryCandidateCount: 0, errors: 0 });

    for (const item of items) {
        const key = item.stableKey || buildStableKey(item.name, item.address, item.phone);
        const ykiho = getHiraYkiho(item);
        if (!ykiho || !eligibleKeys.has(key) || repeatedDetailFailureCount >= 5) {
            enriched.push(item);
            continue;
        }

        try {
            const equipmentRows = await fetchHiraDetailRows(serviceKey, "getMedOftInfo2.7", ykiho);
            const departmentRows = (getRawData(item).hiraDepartments || []) as HiraDetailRow[];
            equipmentCount++;
            repeatedDetailFailureCount = 0;
            enriched.push(applyHiraDetailSignals(item, departmentRows, equipmentRows));
        } catch (error: any) {
            equipmentCount++;
            repeatedDetailFailureCount++;
            if (errors.length < 20) {
                errors.push({ source: "HIRA 의료장비 상세정보", message: `${item.name}: ${error?.message || "의료장비 조회 실패"}` });
            }
            enriched.push(item);
        }

        if (equipmentCount % 25 === 0 || equipmentCount === total) {
            const currentItems = [...enriched, ...items.slice(enriched.length)];
            await reportProgress(options, {
                stage: "hira_equipment",
                processed: equipmentCount,
                total,
                equipmentProcessed: equipmentCount,
                deliveryCandidateCount: currentItems.filter(isFinalDeliveryCandidate).length,
                errors: errors.length,
            });
        }
    }

    if (eligibleItems.length > limit) {
        errors.push({ source: "HIRA 의료장비 상세정보", message: `의료장비 상세조사 상한 ${limit}건에 도달했습니다. MARKET_RESEARCH_HIRA_DETAIL_LIMIT로 조정 가능합니다.` });
    }
    if (repeatedDetailFailureCount >= 5) {
        errors.push({ source: "HIRA 의료장비 상세정보", message: "상세정보 API 연속 실패가 발생해 남은 의료장비 조회를 중단했습니다. 의료기관별상세정보서비스 활용신청 또는 인증키 권한을 확인해야 합니다." });
    }

    return {
        items: enriched,
        sources: equipmentCount > 0 ? ["HIRA 의료기관별상세정보서비스:의료장비"] : [],
        errors,
    };
}

async function enrichWithHiraDetails(items: NewMarketResearchItem[], serviceKey: string): Promise<MarketResearchCollectResult> {
    const errors: MarketResearchCollectResult["errors"] = [];
    const limit = getEnvInt("MARKET_RESEARCH_HIRA_DETAIL_LIMIT", DEFAULT_HIRA_DETAIL_LIMIT);
    const enriched: NewMarketResearchItem[] = [];
    let detailedCount = 0;
    let repeatedDetailFailureCount = 0;

    for (const item of items) {
        const rawData = getRawData(item);
        const ykiho = getHiraYkiho(item);
        if (!rawData.detailedResearchEligible || !ykiho || detailedCount >= limit || repeatedDetailFailureCount >= 5) {
            enriched.push(item);
            continue;
        }

        try {
            const [departmentRows, equipmentRows] = await Promise.all([
                fetchHiraDetailRows(serviceKey, "getSpcSbjtSdrInfo2.7", ykiho),
                fetchHiraDetailRows(serviceKey, "getMedOftInfo2.7", ykiho),
            ]);
            enriched.push(applyHiraDetailSignals(item, departmentRows, equipmentRows));
            detailedCount++;
            repeatedDetailFailureCount = 0;
        } catch (error: any) {
            repeatedDetailFailureCount++;
            if (errors.length < 20) {
                errors.push({ source: "HIRA 의료기관별상세정보서비스", message: `${item.name}: ${error?.message || "상세정보 조회 실패"}` });
            }
            enriched.push(item);
        }
    }

    if (detailedCount >= limit) {
        errors.push({ source: "HIRA 의료기관별상세정보서비스", message: `상세조사 상한 ${limit}건에 도달했습니다. MARKET_RESEARCH_HIRA_DETAIL_LIMIT로 조정 가능합니다.` });
    }
    if (repeatedDetailFailureCount >= 5) {
        errors.push({ source: "HIRA 의료기관별상세정보서비스", message: "상세정보 API 연속 실패가 발생해 남은 상세조사를 중단했습니다. 의료기관별상세정보서비스 활용신청 또는 인증키 권한을 확인해야 합니다." });
    }

    return {
        items: enriched,
        sources: detailedCount > 0 ? ["HIRA 의료기관별상세정보서비스"] : [],
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
    await reportProgress(options, { stage: "hira_base", processed: 0, total: 0, errors: 0 });
    const hiraResult = publicDataKey
        ? await fetchHiraObgynItems(options, publicDataKey)
        : { items: [], sources: [], errors: [{ source: "공공데이터포털", message: "PUBLIC_DATA_SERVICE_KEY가 없어 HIRA 병원정보서비스 수집은 건너뛰었습니다." }] };
    await reportProgress(options, {
        stage: "hira_base",
        processed: hiraResult.items.length,
        total: hiraResult.items.length,
        hiraBaseCount: hiraResult.items.length,
        errors: hiraResult.errors.length,
    });

    const departmentDetailResult = publicDataKey
        ? await enrichWithHiraDepartmentDetails(hiraResult.items, publicDataKey, options)
        : { items: hiraResult.items, sources: [], errors: [] };
    const equipmentDetailResult = publicDataKey
        ? await enrichWithHiraEquipmentDetails(departmentDetailResult.items, publicDataKey, options)
        : { items: departmentDetailResult.items, sources: [], errors: [] };
    const naverResult = await enrichDeliveryCandidatesWithNaverLocal(equipmentDetailResult.items, process.env.NAVER_CLIENT_ID, process.env.NAVER_CLIENT_SECRET, options);
    const postpartumImport = await importPostpartumCareCsvFromDrive({
        businessTypes: options.businessTypes,
        operationStatuses: options.operationStatuses,
        regions: options.regions,
    });
    await reportProgress(options, {
        stage: "drive_csv",
        processed: postpartumImport.items.length,
        total: postpartumImport.items.length,
        deliveryCandidateCount: naverResult.items.filter(isFinalDeliveryCandidate).length,
        naverProcessed: Math.min(getEnvInt("MARKET_RESEARCH_NAVER_LOCAL_LIMIT", DEFAULT_NAVER_LOCAL_LIMIT), naverResult.items.filter(isFinalDeliveryCandidate).length),
        errors: hiraResult.errors.length + departmentDetailResult.errors.length + equipmentDetailResult.errors.length + naverResult.errors.length + postpartumImport.errors.length,
    });

    const hospitalItems = naverResult.items
        .filter((item) => marketResearchBusinessTypeAllowed(item, options.businessTypes))
        .filter((item) => operationStatusAllowed(item.operationStatus || "unknown", options.operationStatuses))
        .filter((item) => regionAllowed(item, options.regions));

    if (!process.env.KOSIS_API_KEY) {
        errors.push({ source: "KOSIS", message: "KOSIS API 키가 없어 출산율 자동조회는 건너뛰었습니다." });
    }
    errors.push(...hiraResult.errors);
    errors.push(...departmentDetailResult.errors);
    errors.push(...equipmentDetailResult.errors);
    errors.push(...naverResult.errors);
    errors.push(...postpartumImport.errors);

    const realItems = mergeUniqueItems([hospitalItems, postpartumImport.items]);
    const items = realItems.length > 0 ? realItems : buildBaseItems(options);
    if (realItems.length === 0) {
        errors.push({ source: "시장조사 수집기", message: "실제 원천 수집 결과가 없어 검증용 샘플 데이터를 반환했습니다." });
    }
    const sources = Array.from(new Set([
        ...DEFAULT_SOURCES,
        ...hiraResult.sources,
        ...departmentDetailResult.sources,
        ...equipmentDetailResult.sources,
        ...naverResult.sources,
        ...(postpartumImport.items.length > 0 && postpartumImport.sourceName ? [`Google Drive CSV:${postpartumImport.sourceName}`] : []),
    ]));

    await reportProgress(options, {
        stage: "collected",
        processed: items.length,
        total: items.length,
        hiraBaseCount: hiraResult.items.length,
        deliveryCandidateCount: items.filter(isFinalDeliveryCandidate).length,
        errors: errors.length,
    });

    return {
        items,
        sources,
        errors,
    };
}

async function collectMarketResearchItemsLegacy(options: MarketResearchCollectOptions): Promise<MarketResearchCollectResult> {
    const errors: Array<{ source: string; message: string }> = [];
    const publicDataKey = process.env.PUBLIC_DATA_SERVICE_KEY || process.env.HIRA_SERVICE_KEY;
    const hiraResult = publicDataKey
        ? await fetchHiraObgynItems(options, publicDataKey)
        : { items: [], sources: [], errors: [{ source: "공공데이터포털", message: "PUBLIC_DATA_SERVICE_KEY가 없어 HIRA 병원정보서비스 수집은 건너뛰었습니다." }] };
    const naverResult = await enrichWithNaverLocal(hiraResult.items, process.env.NAVER_CLIENT_ID, process.env.NAVER_CLIENT_SECRET);
    const hiraDetailResult = publicDataKey
        ? await enrichWithHiraDetails(naverResult.items, publicDataKey)
        : { items: naverResult.items, sources: [], errors: [] };
    const postpartumImport = await importPostpartumCareCsvFromDrive({
        businessTypes: options.businessTypes,
        operationStatuses: options.operationStatuses,
        regions: options.regions,
    });
    const hospitalItems = hiraDetailResult.items
        .filter((item) => marketResearchBusinessTypeAllowed(item, options.businessTypes))
        .filter((item) => operationStatusAllowed(item.operationStatus || "unknown", options.operationStatuses))
        .filter((item) => regionAllowed(item, options.regions));

    if (!process.env.KOSIS_API_KEY) {
        errors.push({ source: "KOSIS", message: "KOSIS API 키가 없어 출산율 자동조회는 건너뛰었습니다." });
    }
    errors.push(...hiraResult.errors);
    errors.push(...naverResult.errors);
    errors.push(...hiraDetailResult.errors);
    errors.push(...postpartumImport.errors);

    const realItems = mergeUniqueItems([hospitalItems, postpartumImport.items]);
    const items = realItems.length > 0 ? realItems : buildBaseItems(options);
    if (realItems.length === 0) {
        errors.push({ source: "시장조사 수집기", message: "실제 원천 수집 결과가 없어 검증용 샘플 데이터를 반환했습니다." });
    }
    const sources = Array.from(new Set([
        ...DEFAULT_SOURCES,
        ...hiraResult.sources,
        ...naverResult.sources,
        ...hiraDetailResult.sources,
        ...(postpartumImport.items.length > 0 && postpartumImport.sourceName ? [`Google Drive CSV:${postpartumImport.sourceName}`] : []),
    ]));

    return {
        items,
        sources,
        errors,
    };
}

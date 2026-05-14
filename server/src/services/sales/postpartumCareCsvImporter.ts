import { google } from "googleapis";
import type { marketResearchItems } from "../../db/schema.js";

type NewMarketResearchItem = typeof marketResearchItems.$inferInsert;

export interface PostpartumCareImportResult {
    items: NewMarketResearchItem[];
    sourceName?: string;
    sourceFileId?: string;
    errors: Array<{ source: string; message: string }>;
}

const CSV_MIME_TYPES = new Set([
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
]);
const DEFAULT_MARKET_RESEARCH_DRIVE_FOLDER_ID = "1BisYCkfPiW7a7BIrIsX_n_Aqd0ZqDvd-";

function normalizeText(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, "").toLowerCase();
}

function buildStableKey(name: string, address?: string | null, phone?: string | null): string {
    return [normalizeText(name), normalizeText(address), normalizeText(phone)].filter(Boolean).join("|");
}

function getDriveClient() {
    const authOptions: any = { scopes: ["https://www.googleapis.com/auth/drive.readonly"] };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    const auth = new google.auth.GoogleAuth(authOptions);
    return google.drive({ version: "v3", auth });
}

function getMarketResearchFolderId(): string {
    return process.env.MARKET_RESEARCH_DRIVE_FOLDER_ID
        || process.env.GOOGLE_DRIVE_MARKET_RESEARCH_FOLDER_ID
        || DEFAULT_MARKET_RESEARCH_DRIVE_FOLDER_ID;
}

function decodeCsv(buffer: Buffer): string {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
    if (replacementCount < 5 && utf8.includes("사업장명")) return utf8;
    return new TextDecoder("euc-kr", { fatal: false }).decode(buffer);
}

function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === "," && !quoted) {
            cells.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

function parseCsv(content: string): Record<string, string>[] {
    const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || "";
        });
        return row;
    });
}

function toInt(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = parseInt(value.replace(/[^0-9-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: string | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/[^0-9]/g, "");
    if (digits.length !== 8) return null;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function splitAddress(address: string): { region: string; city: string | null; district: string | null } {
    const parts = address.split(/\s+/).filter(Boolean);
    return {
        region: parts[0] || "전국",
        city: parts[0] || null,
        district: parts[1] || null,
    };
}

function normalizeOperationStatus(row: Record<string, string>): "operating" | "closed" | "unknown" {
    const statusText = `${row["영업상태명"] || ""} ${row["상세영업상태명"] || ""}`;
    if (row["폐업일자"] || statusText.includes("폐업")) return "closed";
    if (statusText.includes("영업") || statusText.includes("정상")) return "operating";
    return "unknown";
}

function passesRequestedFilters(item: NewMarketResearchItem, businessTypes: string[], operationStatuses: string[], regions: string[]): boolean {
    const typeAllowed = businessTypes.length === 0 || businessTypes.includes("postpartum_center");
    const statusAllowed = operationStatuses.length === 0 || operationStatuses.includes(String(item.operationStatus));
    const regionAllowed = regions.length === 0 || regions.includes("전국") || regions.includes(String(item.region)) || regions.includes(String(item.city));
    return typeAllowed && statusAllowed && regionAllowed;
}

function mapRowToItem(row: Record<string, string>, sourceName: string): NewMarketResearchItem | null {
    const name = row["사업장명"]?.trim();
    if (!name) return null;

    const address = row["도로명주소"] || row["지번주소"] || "";
    const { region, city, district } = splitAddress(address);
    const operationStatus = normalizeOperationStatus(row);
    const groundFloors = toInt(row["지상층수"]);
    const basementFloors = toInt(row["지하층수"]);
    const buildingFloors = toInt(row["건물층수"]);
    const motherCapacity = toInt(row["임산부정원수"]);
    const babyCapacity = toInt(row["영유아정원수"]);
    const occupiedFloors = [groundFloors ? `지상 ${groundFloors}층` : "", basementFloors ? `지하 ${basementFloors}층` : ""]
        .filter(Boolean)
        .join(", ") || null;

    return {
        stableKey: buildStableKey(name, address, row["전화번호"]),
        businessType: "postpartum_center",
        name,
        normalizedName: name.replace(/\s+/g, "").toLowerCase(),
        region,
        city,
        district,
        address,
        operationStatus,
        phone: row["전화번호"] || null,
        openDate: toDate(row["인허가일자"]),
        closedDate: toDate(row["폐업일자"]),
        isNew: false,
        hasUpdates: false,
        isSelected: false,
        isDeliveryHospital: false,
        roomCount: motherCapacity,
        motherCapacity,
        babyCapacity,
        buildingScale: buildingFloors ? `건물 ${buildingFloors}층 규모` : null,
        occupiedFloors,
        latitude: row["좌표정보(Y)"] || null,
        longitude: row["좌표정보(X)"] || null,
        marketScore: operationStatus === "operating" ? 60 : 0,
        priorityGrade: operationStatus === "operating" ? "B" : "C",
        sources: ["행정안전부 공공데이터", "Google Drive CSV"],
        sourceUrls: [],
        sourceConfidence: "official",
        verificationStatus: "auto_collected",
        rawData: {
            sourceName,
            managementNumber: row["관리번호"] || null,
            localGovernmentCode: row["개방자치단체코드"] || null,
            nurses: toInt(row["간호사수"]),
            nursingAssistants: toInt(row["간호조무사수"]),
            nutritionists: toInt(row["영양사수"]),
            cooks: toInt(row["취사부수"]),
            officeArea: row["사무실면적"] || null,
            nursingRoomArea: row["모유수유실면적"] || null,
            motherRoomArea: row["임산부실면적"] || null,
            babyRoomArea: row["영유아실면적"] || null,
            bathArea: row["목욕실면적"] || null,
            updatedAtSource: row["최종수정시점"] || row["데이터갱신시점"] || null,
        },
        lastResearchedAt: new Date(),
    };
}

async function downloadFile(fileId: string): Promise<Buffer> {
    const drive = getDriveClient();
    const response = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
    );
    return Buffer.from(response.data as ArrayBuffer);
}

async function findLatestCsv(folderId: string) {
    const drive = getDriveClient();
    const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, modifiedTime, size, webViewLink)",
        orderBy: "modifiedTime desc",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    });
    return (response.data.files || []).find((file) => {
        const name = file.name || "";
        const mimeType = file.mimeType || "";
        return name.toLowerCase().endsWith(".csv") || CSV_MIME_TYPES.has(mimeType);
    });
}

export async function importPostpartumCareCsvFromDrive(options: {
    businessTypes?: string[];
    operationStatuses?: string[];
    regions?: string[];
}): Promise<PostpartumCareImportResult> {
    const folderId = getMarketResearchFolderId();
    if (!folderId) {
        return {
            items: [],
            errors: [{ source: "Google Drive CSV", message: "MARKET_RESEARCH_DRIVE_FOLDER_ID가 없어 산후조리원 CSV import를 건너뛰었습니다." }],
        };
    }

    try {
        const file = await findLatestCsv(folderId);
        if (!file?.id) {
            return {
                items: [],
                errors: [{ source: "Google Drive CSV", message: "시장조사 Drive 폴더에서 CSV 파일을 찾지 못했습니다." }],
            };
        }

        const buffer = await downloadFile(file.id);
        const rows = parseCsv(decodeCsv(buffer));
        const items = rows
            .map((row) => mapRowToItem(row, file.name || "산후조리원 CSV"))
            .filter((item): item is NewMarketResearchItem => !!item)
            .filter((item) => passesRequestedFilters(item, options.businessTypes || [], options.operationStatuses || [], options.regions || []));

        return {
            items,
            sourceName: file.name || undefined,
            sourceFileId: file.id,
            errors: [],
        };
    } catch (error: any) {
        return {
            items: [],
            errors: [{ source: "Google Drive CSV", message: error?.message || "산후조리원 CSV import 실패" }],
        };
    }
}

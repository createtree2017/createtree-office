import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { marketResearchItems } from "../src/db/schema.js";
import { enrichMarketResearchItemWithNaverInfo } from "../src/services/sales/marketResearchCollector.js";

dotenv.config();

const args = new Set(process.argv.slice(2));
const write = args.has("--write") || process.env.MARKET_RESEARCH_NAVER_REFRESH_WRITE === "true";
const limit = Number.parseInt(process.env.MARKET_RESEARCH_NAVER_REFRESH_LIMIT || "20", 10);
const delayMs = Number.parseInt(process.env.MARKET_RESEARCH_NAVER_REFRESH_DELAY_MS || "500", 10);
const onlyDeliveryCandidates = process.env.MARKET_RESEARCH_NAVER_REFRESH_ONLY_DELIVERY !== "false";

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDeliveryCandidate(item: any): boolean {
    return item.businessType === "delivery_hospital";
}

function getNaverPlaceUrl(rawData: any): string | null {
    const manualUrl = String(rawData?.manualNaverPlaceUrl || "");
    const autoUrl = String(rawData?.naverPlaceUrl || "");
    if (manualUrl.includes("map.naver.com/p/entry/place/")) return manualUrl;
    if (autoUrl.includes("map.naver.com/p/entry/place/")) return autoUrl;
    return null;
}

function mergeManualCorrections(existing: any, enriched: any) {
    if (existing.verificationStatus !== "manually_corrected") return enriched;
    const manualRawData = Object.fromEntries(
        Object.entries(existing.rawData || {}).filter(([key]) => key.startsWith("manual")),
    );

    return {
        ...enriched,
        phone: existing.phone || enriched.phone,
        email: existing.email || enriched.email,
        website: existing.website || enriched.website,
        instagram: existing.instagram || enriched.instagram,
        blog: existing.blog || enriched.blog,
        memo: existing.memo || enriched.memo,
        verificationStatus: existing.verificationStatus,
        rawData: {
            ...(enriched.rawData || {}),
            ...manualRawData,
        },
    };
}

async function main() {
    const rows = await db.select().from(marketResearchItems);
    const targets = rows
        .filter((item) => !onlyDeliveryCandidates || isDeliveryCandidate(item))
        .slice(0, Number.isFinite(limit) && limit > 0 ? limit : rows.length);

    let updated = 0;
    const errors: Array<{ id: number; name: string; messages: string[] }> = [];

    for (const [index, item] of targets.entries()) {
        if (index > 0 && delayMs > 0) await sleep(delayMs);
        const result = await enrichMarketResearchItemWithNaverInfo(item as any);
        const next = mergeManualCorrections(item, result.item);

        if (result.errors.length > 0) {
            errors.push({ id: item.id, name: item.name, messages: result.errors.map((error) => `${error.source}: ${error.message}`) });
        }

        if (write) {
            await db.update(marketResearchItems).set({
                phone: next.phone || null,
                website: next.website || null,
                blog: next.blog || null,
                instagram: next.instagram || null,
                sourceUrls: next.sourceUrls || [],
                sources: next.sources || [],
                rawData: next.rawData || {},
                updatedAt: new Date(),
                lastResearchedAt: new Date(),
            }).where(eq(marketResearchItems.id, item.id));
            updated++;
        }

        console.log(JSON.stringify({
            id: item.id,
            name: item.name,
            mode: write ? "updated" : "dry-run",
            phone: next.phone || null,
            website: next.website || null,
            blog: next.blog || null,
            instagram: next.instagram || null,
            naverPlaceUrl: getNaverPlaceUrl(next.rawData),
            linkCount: next.rawData?.naverPlaceLinks?.length || 0,
        }));
    }

    console.log(JSON.stringify({
        success: true,
        mode: write ? "write" : "dry-run",
        scanned: targets.length,
        updated,
        onlyDeliveryCandidates,
        errors,
    }, null, 2));
}

main().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error(JSON.stringify({
        success: false,
        message: error?.message || "네이버 정보 보강 실패",
    }, null, 2));
    process.exit(1);
});

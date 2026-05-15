import dotenv from "dotenv";
import { collectMarketResearchItems } from "../src/services/sales/marketResearchCollector.js";

dotenv.config();

process.env.MARKET_RESEARCH_HIRA_MAX_ROWS = process.env.MARKET_RESEARCH_HIRA_MAX_ROWS || "10";
process.env.MARKET_RESEARCH_NAVER_LOCAL_LIMIT = process.env.MARKET_RESEARCH_NAVER_LOCAL_LIMIT || "10";
process.env.MARKET_RESEARCH_HIRA_DETAIL_LIMIT = process.env.MARKET_RESEARCH_HIRA_DETAIL_LIMIT || "10";
process.env.MARKET_RESEARCH_NAVER_DELAY_MS = process.env.MARKET_RESEARCH_NAVER_DELAY_MS || "500";
process.env.MARKET_RESEARCH_NAVER_RETRY_DELAY_MS = process.env.MARKET_RESEARCH_NAVER_RETRY_DELAY_MS || "2000";
process.env.MARKET_RESEARCH_NAVER_MAX_RETRIES = process.env.MARKET_RESEARCH_NAVER_MAX_RETRIES || "3";

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function main() {
    const result = await collectMarketResearchItems({
        title: "시장조사 프로덕션 샘플 검증",
        regions: ["서울"],
        businessTypes: ["obgyn"],
        operationStatuses: [],
        queryName: "고은빛",
    });

    const hospitalItems = result.items.filter((item) => item.businessType !== "postpartum_center");
    const deliveryCandidates = hospitalItems.filter((item) => item.rawData?.deliveryCandidate?.score >= 3 || item.isDeliveryHospital);
    const naverMatched = hospitalItems.filter((item) => item.rawData?.naverLocal?.category);
    const sample = deliveryCandidates[0] || hospitalItems.find((item) => item.rawData?.deliveryCandidate) || hospitalItems[0];

    assert(hospitalItems.length > 0, "HIRA 기본목록 샘플 결과가 없습니다.");
    assert(naverMatched.length > 0, "네이버 지역검색 카테고리 샘플 결과가 없습니다.");
    assert(deliveryCandidates.length > 0, "분만병원 후보 점수 3점 이상 샘플 결과가 없습니다.");
    assert(sample?.rawData?.deliveryCandidate?.obgynDoctorCount >= 3, "산부인과 전문의 수 조건 샘플 검증 실패");
    assert(sample?.rawData?.deliveryCandidate?.pediatricDoctorCount >= 1, "소아청소년과 조건 샘플 검증 실패");
    assert(sample?.rawData?.deliveryCandidate?.incubatorCount >= 1, "인큐베이터 조건 샘플 검증 실패");
    assert(sample?.rawData?.deliveryCandidate?.deliveryMonitorCount >= 1, "분만감시기 조건 샘플 검증 실패");

    console.log(JSON.stringify({
        success: true,
        total: result.items.length,
        hospitalItems: hospitalItems.length,
        naverMatched: naverMatched.length,
        deliveryCandidates: deliveryCandidates.length,
        errors: result.errors,
        sample: sample ? {
            name: sample.name,
            businessType: sample.businessType,
            isDeliveryHospital: sample.isDeliveryHospital,
            naverCategory: sample.rawData?.naverLocal?.category,
            deliveryCandidate: sample.rawData?.deliveryCandidate,
            doctorCounts: sample.doctorCounts,
        } : null,
    }, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        message: error?.message || "시장조사 샘플 검증 실패",
    }, null, 2));
    process.exit(1);
});

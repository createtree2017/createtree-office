/**
 * 서비스 상품 마스터 시드 데이터
 * CSV 데이터 기반 7개 서비스 초기 등록 스크립트
 * 실행: cd server && npx tsx src/scripts/seedServices.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { db } from "../db/index.js";
import {
    services,
    serviceTiers,
    serviceItems,
    serviceItemPrices,
    contractDiscountPolicies,
} from "../db/schema.js";

async function seed() {
    console.log("🌱 서비스 상품 시드 데이터 등록 시작...\n");

    // ════════════════════════════════════
    // 1. 할인 정책
    // ════════════════════════════════════
    console.log("📋 할인 정책 등록...");
    await db.insert(contractDiscountPolicies).values([
        { name: "6개월 계약 할인", minMonths: 6, discountRate: 5, isActive: true },
        { name: "12개월 계약 할인", minMonths: 12, discountRate: 10, isActive: true },
    ]);

    // ════════════════════════════════════
    // 2. 행사
    // ════════════════════════════════════
    console.log("🎉 [1/7] 행사 등록...");
    const [eventSvc] = await db.insert(services).values({
        name: "행사", slug: "event",
        description: "병원고객참여 행사 브랜드마케팅 + 콘텐츠확보. 최소인원 미만 모집시 행사연기.",
        billingType: "per_event", sortOrder: 0,
        metadata: { paymentOptions: ["lump_sum", "installment"], note: "1회 기준 비용, 분할결제 선택 가능" },
    }).returning();
    const [eventT1] = await db.insert(serviceTiers).values({ serviceId: eventSvc.id, name: "10~20명", description: "부부 5~10팀", minQuantity: 10, maxQuantity: 20, sortOrder: 0 }).returning();
    const [eventT2] = await db.insert(serviceTiers).values({ serviceId: eventSvc.id, name: "15~30명", description: "부부 7~15팀", minQuantity: 15, maxQuantity: 30, sortOrder: 1 }).returning();
    const [eventItem] = await db.insert(serviceItems).values({ serviceId: eventSvc.id, name: "행사 진행 비용", description: "강사+재료+홍보물+디자인+후기선물", category: "fixed", isRequired: true, priceUnit: "per_event", unitLabel: "회", sortOrder: 0 }).returning();
    await db.insert(serviceItemPrices).values([
        { itemId: eventItem.id, tierId: eventT1.id, price: 150 },
        { itemId: eventItem.id, tierId: eventT2.id, price: 200 },
    ]);

    // ════════════════════════════════════
    // 3. 서포터즈
    // ════════════════════════════════════
    console.log("👥 [2/7] 서포터즈 등록...");
    const [suppSvc] = await db.insert(services).values({
        name: "서포터즈", slug: "supporters",
        description: "병원고객 서포터즈를 통해 바이럴 활동과 평판 관리를 진행. 필수비용(월초 정기청구) + 추가미션(월말 정산).",
        billingType: "monthly", sortOrder: 1,
        metadata: { billingNote: "필수: 월초 정기청구, 변동: 월말 실적 정산" },
    }).returning();
    const [suppT1] = await db.insert(serviceTiers).values({ serviceId: suppSvc.id, name: "1~5명", minQuantity: 1, maxQuantity: 5, sortOrder: 0 }).returning();
    const [suppT2] = await db.insert(serviceTiers).values({ serviceId: suppSvc.id, name: "6~10명", minQuantity: 6, maxQuantity: 10, sortOrder: 1 }).returning();

    // 운영비 (필수, 등급별 가격)
    const [suppOp] = await db.insert(serviceItems).values({ serviceId: suppSvc.id, name: "운영비", description: "창조트리 1개월 운영비용", category: "fixed", isRequired: true, priceUnit: "per_month", unitLabel: "월", sortOrder: 0 }).returning();
    await db.insert(serviceItemPrices).values([
        { itemId: suppOp.id, tierId: suppT1.id, price: 50 },
        { itemId: suppOp.id, tierId: suppT2.id, price: 80 },
    ]);

    // 상품비용 (필수, 인당 공통단가)
    const [suppProd] = await db.insert(serviceItems).values({ serviceId: suppSvc.id, name: "상품비용", description: "서포터즈 1인당 상품 비용", category: "fixed", isRequired: true, priceUnit: "per_person", unitLabel: "인", sortOrder: 1 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: suppProd.id, tierId: null, price: 10 });

    // 유튜브 롱폼 (선택, 건당 공통단가)
    const [suppLong] = await db.insert(serviceItems).values({ serviceId: suppSvc.id, name: "유튜브 롱폼 영상", category: "variable", isRequired: false, priceUnit: "per_item", unitLabel: "건", sortOrder: 2 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: suppLong.id, tierId: null, price: 10 });

    // 유튜브 숏폼 (선택)
    const [suppShort] = await db.insert(serviceItems).values({ serviceId: suppSvc.id, name: "유튜브 숏폼 영상", category: "variable", isRequired: false, priceUnit: "per_item", unitLabel: "건", sortOrder: 3 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: suppShort.id, tierId: null, price: 5 });

    // 카페 바이럴 (선택)
    const [suppCafe] = await db.insert(serviceItems).values({ serviceId: suppSvc.id, name: "카페 바이럴", description: "댓글활동 및 리뷰활동 등", category: "variable", isRequired: false, priceUnit: "per_item", unitLabel: "건", sortOrder: 4 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: suppCafe.id, tierId: null, price: 1 });

    // ════════════════════════════════════
    // 4. AI 문화센터 app
    // ════════════════════════════════════
    console.log("📱 [3/7] AI 문화센터 등록...");
    const [cultureSvc] = await db.insert(services).values({
        name: "AI 문화센터 app", slug: "ai_culture_center",
        description: "고객혜택 + 브랜드마케팅 + 이탈율방지. 임신 육아 문화센터 앱.",
        billingType: "monthly", sortOrder: 2,
    }).returning();
    const [cultureT1] = await db.insert(serviceTiers).values({ serviceId: cultureSvc.id, name: "500명 기준", minQuantity: 1, maxQuantity: 500, sortOrder: 0 }).returning();
    const [cultureT2] = await db.insert(serviceTiers).values({ serviceId: cultureSvc.id, name: "1000명 기준", minQuantity: 501, maxQuantity: 1000, sortOrder: 1 }).returning();
    const [cultureItem] = await db.insert(serviceItems).values({ serviceId: cultureSvc.id, name: "AI문화센터 이용료", description: "AI문화센터 무제한 이용 + 문화센터 신청 운영", category: "fixed", isRequired: true, priceUnit: "per_month", unitLabel: "월", sortOrder: 0 }).returning();
    await db.insert(serviceItemPrices).values([
        { itemId: cultureItem.id, tierId: cultureT1.id, price: 100 },
        { itemId: cultureItem.id, tierId: cultureT2.id, price: 180 },
    ]);

    // ════════════════════════════════════
    // 5. AI 오피스 app
    // ════════════════════════════════════
    console.log("🏢 [4/7] AI 오피스 등록...");
    const [officeSvc] = await db.insert(services).values({
        name: "AI 오피스 app", slug: "ai_office",
        description: "업무자동화 + 마케팅지원. 계약관리, 견적관리, 모니터링자동화, 콘텐츠자동화.",
        billingType: "monthly", sortOrder: 3,
    }).returning();
    const [officeItem1] = await db.insert(serviceItems).values({ serviceId: officeSvc.id, name: "모니터링/콘텐츠 자동화", description: "모니터링자동화 + 콘텐츠 생성 자동화", category: "fixed", isRequired: true, priceUnit: "per_month", unitLabel: "월", sortOrder: 0 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: officeItem1.id, tierId: null, price: 50 });

    // ════════════════════════════════════
    // 6. 홈페이지 제작
    // ════════════════════════════════════
    console.log("🌐 [5/7] 홈페이지 제작 등록...");
    const [webSvc] = await db.insert(services).values({
        name: "홈페이지 제작", slug: "website",
        description: "AI검색 + 포털 검색(웹문서)에 최적화된 홈페이지 제작. 최대 30페이지 기준.",
        billingType: "one_time", sortOrder: 4,
        metadata: { includes: "예약+관리+디자인+개발+1년호스팅+3년도메인", freeAS: "개발시작부터 1년 무상 AS" },
    }).returning();
    const [webItem1] = await db.insert(serviceItems).values({ serviceId: webSvc.id, name: "홈페이지 제작비", description: "정찰제. 예약+관리+디자인+개발+1년 호스팅+3년 도메인 포함", category: "fixed", isRequired: true, priceUnit: "one_time", unitLabel: "회", sortOrder: 0 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: webItem1.id, tierId: null, price: 500 });

    const [webItem2] = await db.insert(serviceItems).values({ serviceId: webSvc.id, name: "관리운영비", description: "1년 이후부터 월 유지보수 비용", category: "fixed", isRequired: false, priceUnit: "per_month", unitLabel: "월", sortOrder: 1 }).returning();
    await db.insert(serviceItemPrices).values({ itemId: webItem2.id, tierId: null, price: 20 });

    // ════════════════════════════════════
    // 7. AI 자동화 병원내 프로그램 개발
    // ════════════════════════════════════
    console.log("🤖 [6/7] AI 자동화 프로그램 등록...");
    await db.insert(services).values({
        name: "AI 자동화 프로그램 개발", slug: "ai_custom_dev",
        description: "병원 내 맞춤 AI 자동화 프로그램 개발. 문의/컨설팅 후 별도 견적.",
        billingType: "quote_based", sortOrder: 5,
    });

    // ════════════════════════════════════
    // 8. 인테리어/리모델링
    // ════════════════════════════════════
    console.log("🔧 [7/7] 인테리어/리모델링 등록...");
    await db.insert(services).values({
        name: "인테리어/리모델링/간판", slug: "interior",
        description: "산부인과 전문 컨설팅 시공. 문의/컨설팅 후 별도 견적.",
        billingType: "quote_based", sortOrder: 6,
    });

    console.log("\n✅ 서비스 상품 시드 데이터 등록 완료!");
    console.log("   - 할인 정책: 2개 (6개월 5%, 12개월 10%)");
    console.log("   - 서비스: 7개 (행사, 서포터즈, AI문화센터, AI오피스, 홈페이지, AI자동화, 인테리어)");
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ 시드 데이터 등록 실패:", err);
    process.exit(1);
});

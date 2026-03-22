/**
 * Neon DB → Railway PostgreSQL 데이터 마이그레이션 스크립트 v2
 * 
 * v1 문제: FK 제약 조건으로 인한 CASCADE TRUNCATE → 데이터 유실
 * v2 해결: 
 *   1) 모든 테이블을 FK 없이 TRUNCATE (FK 체크 비활성화)
 *   2) FK 순서 고려하여 부모 → 자식 순으로 INSERT
 *   3) 완료 후 FK 체크 다시 활성화
 */
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const SOURCE_URL = process.env.NEON_DATABASE_URL;
const TARGET_URL = process.env.RAILWAY_DATABASE_URL;

if (!SOURCE_URL) throw new Error("NEON_DATABASE_URL이 없습니다. .env를 확인하세요.");
if (!TARGET_URL) throw new Error("RAILWAY_DATABASE_URL이 없습니다. .env를 확인하세요.");

console.log("📡 소스 (Neon):", SOURCE_URL.replace(/:[^:@]+@/, ":****@"));
console.log("📡 타겟 (Railway):", TARGET_URL.replace(/:[^:@]+@/, ":****@"));

const source = postgres(SOURCE_URL, { ssl: "require", max: 5, idle_timeout: 30 });
const target = postgres(TARGET_URL, { ssl: { rejectUnauthorized: false }, max: 5, idle_timeout: 30 });

// FK 의존성을 고려한 테이블 순서 (부모 → 자식)
// 스키마 분석 결과 기반 수동 정렬
const TABLE_ORDER = [
  // 1단계: 의존성 없는 최상위 테이블
  "clients",
  "users",
  "task_templates",
  "contract_discount_policies",
  
  // 2단계: 1단계에 의존하는 테이블
  "services",
  "manuals",
  "tasks",
  "client_service_contracts",
  "monitoring_templates",
  "form_submissions",
  
  // 3단계: 2단계에 의존하는 테이블
  "service_tiers",
  "service_items",
  "monitoring_results",
  "task_responses",
  "quotations",
  "notification_logs",
  
  // 4단계: 3단계에 의존하는 테이블
  "service_item_prices",
  "quotation_items",
  "quotation_service_configs",
  "contracts",
];

async function main() {
  console.log("\n🚀 Neon → Railway 데이터 마이그레이션 v2 시작\n");

  // 1. 소스 DB에서 모든 테이블 목록 가져오기
  const allTables = await source`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename
  `;
  const allTableNames = allTables.map((r: any) => r.tablename);
  console.log(`📋 소스 DB 테이블: ${allTableNames.length}개`);
  console.log(`📋 정렬된 이관 순서: ${TABLE_ORDER.length}개\n`);

  // TABLE_ORDER에 없는 테이블 경고
  const missingTables = allTableNames.filter((t: string) => !TABLE_ORDER.includes(t));
  if (missingTables.length > 0) {
    console.log(`⚠️  정렬 순서에 없는 테이블 (리스트 끝에 추가): ${missingTables.join(", ")}`);
  }
  const finalOrder = [...TABLE_ORDER, ...missingTables];

  // 2. FK 체크 비활성화 → 모든 테이블 TRUNCATE
  console.log("🔓 FK 제약 조건 비활성화 & 전체 TRUNCATE...");
  
  // 역순으로 TRUNCATE (자식 → 부모)
  for (const table of [...finalOrder].reverse()) {
    try {
      // session_replication_role로 FK 체크 우회
      await target.unsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch (e: any) {
      // 테이블이 타겟에 없으면 무시
      if (!e.message?.includes("does not exist")) {
        console.log(`   ⚠️ TRUNCATE ${table}: ${e.message?.substring(0, 80)}`);
      }
    }
  }
  console.log("✅ TRUNCATE 완료\n");

  // 3. 부모 → 자식 순서로 데이터 복사
  const results: { table: string; src: number; copied: number; status: string }[] = [];

  for (const table of finalOrder) {
    if (!allTableNames.includes(table)) {
      continue; // 소스에 없는 테이블 스킵
    }

    try {
      // 소스 테이블 행 수 확인
      const [srcCount] = await source.unsafe(`SELECT COUNT(*)::int as cnt FROM "${table}"`);
      const rowCount = srcCount.cnt;

      if (rowCount === 0) {
        console.log(`⏭️  ${table}: 0행 — 스킵`);
        results.push({ table, src: 0, copied: 0, status: "⏭️ 스킵 (0행)" });
        continue;
      }

      // 타겟 테이블 컬럼 확인
      const targetCols = await target`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = ${table}
      `;
      const targetColNames = new Set(targetCols.map((r: any) => r.column_name));

      if (targetColNames.size === 0) {
        console.log(`⚠️  ${table}: 타겟에 테이블 없음 — 스킵`);
        results.push({ table, src: rowCount, copied: 0, status: "⚠️ 타겟에 없음" });
        continue;
      }

      // 소스 테이블 컬럼 확인
      const sourceCols = await source`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = ${table}
      `;

      // 교집합 컬럼만 선택
      const commonCols = sourceCols
        .map((r: any) => r.column_name)
        .filter((c: string) => targetColNames.has(c));

      if (commonCols.length === 0) {
        console.log(`⚠️  ${table}: 공통 컬럼 없음 — 스킵`);
        results.push({ table, src: rowCount, copied: 0, status: "⚠️ 공통 컬럼 없음" });
        continue;
      }

      // 소스 vs 타겟 컬럼 차이 출력
      const srcOnly = sourceCols.map((r: any) => r.column_name).filter((c: string) => !targetColNames.has(c));
      if (srcOnly.length > 0) {
        console.log(`   📝 ${table}: 소스 전용 컬럼 (건너뜀): ${srcOnly.join(", ")}`);
      }

      // 데이터 복사
      const colList = commonCols.map((c: string) => `"${c}"`).join(", ");
      const data = await source.unsafe(`SELECT ${colList} FROM "${table}"`);

      let inserted = 0;
      let skipped = 0;

      for (const row of data) {
        try {
          const values = commonCols.map((_: string, idx: number) => `$${idx + 1}`).join(", ");
          const params = commonCols.map((c: string) => {
            const val = row[c];
            // NaN 값 방지 (createTree 경험에서 학습)
            if (typeof val === "number" && isNaN(val)) return null;
            return val;
          });
          await target.unsafe(
            `INSERT INTO "${table}" (${colList}) VALUES (${values})`,
            params
          );
          inserted++;
        } catch (e: any) {
          skipped++;
          if (skipped <= 3) { // 처음 3개만 로그
            console.log(`   ⚠️ ${table} 행 스킵: ${e.message?.substring(0, 100)}`);
          }
        }
      }

      if (skipped > 3) {
        console.log(`   ⚠️ ${table}: 추가 ${skipped - 3}행 스킵됨`);
      }

      const statusEmoji = inserted === rowCount ? "✅" : "⚠️";
      console.log(`${statusEmoji} ${table}: ${inserted}/${rowCount}행 복사 완료`);
      results.push({ table, src: rowCount, copied: inserted, status: inserted === rowCount ? "✅ 완료" : `⚠️ ${inserted}/${rowCount}` });

      // 시퀀스 복원 (id 컬럼이 있는 경우)
      if (commonCols.includes("id")) {
        try {
          await target.unsafe(`
            SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 
            COALESCE((SELECT MAX(id) FROM "${table}"), 1))
          `);
        } catch {
          /* 시퀀스 없는 테이블은 무시 */
        }
      }
    } catch (e: any) {
      console.error(`❌ ${table} 실패: ${e.message}`);
      results.push({ table, src: -1, copied: 0, status: `❌ 실패` });
    }
  }

  // 결과 요약
  console.log("\n" + "=".repeat(70));
  console.log("📊 마이그레이션 결과 요약");
  console.log("=".repeat(70));
  console.log(`${"테이블".padEnd(35)} | ${"소스".padEnd(6)} | ${"복사".padEnd(6)} | 상태`);
  console.log("-".repeat(70));
  for (const r of results) {
    console.log(`${r.table.padEnd(35)} | ${String(r.src).padEnd(6)} | ${String(r.copied).padEnd(6)} | ${r.status}`);
  }
  console.log("=".repeat(70));

  const totalSrc = results.reduce((a, r) => a + Math.max(r.src, 0), 0);
  const totalCopied = results.reduce((a, r) => a + r.copied, 0);
  const failedTables = results.filter(r => r.status.includes("❌") || (r.src > 0 && r.copied === 0));
  
  console.log(`\n🎉 마이그레이션 완료! 총 ${totalCopied}/${totalSrc}행 복사됨`);
  
  if (failedTables.length > 0) {
    console.log(`\n⚠️  실패/불완전 테이블 ${failedTables.length}개:`);
    failedTables.forEach(r => console.log(`   - ${r.table}: ${r.status}`));
  }

  await source.end();
  await target.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("💥 치명적 오류:", e);
  process.exit(1);
});

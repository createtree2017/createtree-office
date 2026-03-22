import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const TARGET_URL = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;
if (!TARGET_URL) throw new Error("DATABASE_URL 없음");

console.log("DB:", TARGET_URL.replace(/:[^:@]+@/, ":****@"));

const db = postgres(TARGET_URL, { ssl: { rejectUnauthorized: false }, max: 3 });

async function run() {
  try {
    const tables = await db.unsafe(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);

    let totalRows = 0;
    console.log("\n=== Railway DB 데이터 검증 ===");
    
    for (const t of tables) {
      const r = await db.unsafe(`SELECT COUNT(*)::int as cnt FROM "${t.tablename}"`);
      const cnt = r[0].cnt;
      totalRows += cnt;
      if (cnt > 0) console.log(`  ${t.tablename}: ${cnt}행`);
    }
    console.log(`\n총 ${tables.length}개 테이블, ${totalRows}행`);

    // Admin 계정 확인
    const admin = await db.unsafe(`SELECT id, email, name, role FROM users WHERE email = '9059056@gmail.com'`);
    if (admin.length > 0) {
      console.log(`\n✅ Admin: ${admin[0].name} (${admin[0].role})`);
    } else {
      console.log("\n❌ Admin 계정 없음!");
    }

    // 거래처 확인
    const clients = await db.unsafe(`SELECT id, name FROM clients ORDER BY id`);
    console.log(`\n📋 거래처 ${clients.length}개:`);
    clients.forEach((c: any) => console.log(`  [${c.id}] ${c.name}`));

    console.log("\n🎉 검증 완료!");
    await db.end();
    process.exit(0);
  } catch (e: any) {
    console.error("ERROR:", e.message);
    await db.end();
    process.exit(1);
  }
}

run();

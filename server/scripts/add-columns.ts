import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const db = postgres(process.env.DATABASE_URL!, {
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  try {
    console.log("Adding columns to quotation_items...");
    await db.unsafe("ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS remark text;");
    await db.unsafe("ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false NOT NULL;");
    console.log("Success!");
  } catch (err: any) {
    console.error("DB Error:", err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

main();

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error("DATABASE_URL is not provided");
    process.exit(1);
}

const sql = postgres(dbUrl, {
    ssl: { rejectUnauthorized: false },
    max: 3,
});

async function main() {
    try {
        console.log("Adding sort_order column to tasks table...");
        await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;`;
        console.log("Column added successfully.");
    } catch (err: any) {
        console.error("DB Error:", err.message);
    } finally {
        await sql.end();
        process.exit(0);
    }
}

main();

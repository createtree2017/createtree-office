import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not configured.");
    }

    const sql = postgres(connectionString, { max: 1 });
    try {
        await sql`
            ALTER TYPE "public"."sales_status"
            ADD VALUE IF NOT EXISTS 'blacklisted'
            BEFORE 'unsubscribed'
        `;

        const rows = await sql`
            SELECT enumlabel
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public'
              AND t.typname = 'sales_status'
            ORDER BY e.enumsortorder
        `;

        const values = rows.map((row) => row.enumlabel);
        console.log(JSON.stringify({
            hasBlacklisted: values.includes("blacklisted"),
            values,
        }, null, 2));
    } finally {
        await sql.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

import { db } from "./src/db/index.js";
import { sql } from "drizzle-orm";

async function migrate() {
    const queries = [
        `ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT`,
        `ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_invite_code TEXT`,
        `ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_connected_at TIMESTAMP`,
        `ALTER TABLE monitoring_templates ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN DEFAULT false NOT NULL`,
        `ALTER TABLE monitoring_templates ADD COLUMN IF NOT EXISTS notify_channels JSONB DEFAULT '["telegram"]'`,
        `CREATE TABLE IF NOT EXISTS notification_logs (
            id SERIAL PRIMARY KEY,
            client_id INTEGER REFERENCES clients(id),
            channel TEXT NOT NULL DEFAULT 'telegram',
            message_type TEXT NOT NULL DEFAULT 'monitoring',
            content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'sent',
            error_message TEXT,
            template_id INTEGER REFERENCES monitoring_templates(id),
            result_id INTEGER REFERENCES monitoring_results(id),
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`,
    ];

    for (const q of queries) {
        try {
            await db.execute(sql.raw(q));
            console.log("✅", q.substring(0, 70));
        } catch (e: any) {
            console.error("❌", e.message?.substring(0, 100));
        }
    }

    console.log("\n🎉 마이그레이션 완료!");
    process.exit(0);
}

migrate();

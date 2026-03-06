import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function runMigration() {
    try {
        console.log("Connected to Neon DB via Drizzle, running migration...");

        // Add thumbnail column to users table
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS thumbnail text;`);
        console.log("Added 'thumbnail' column successfully.");

        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

runMigration();

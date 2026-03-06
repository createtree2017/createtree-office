import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    try {
        const client = await pool.connect();
        console.log("Connected to DB, running migration...");

        // Add thumbnail column to users table
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS thumbnail text;`);
        console.log("Added thumbnail column successfully.");

        client.release();
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        pool.end();
    }
}

runMigration();

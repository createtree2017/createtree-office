import pg from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

const EMAIL = "9059056@gmail.com";
const PASSWORD = "123456";
const NAME = "최고관리자";

async function createAdmin() {
    await client.connect();
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    const { rows: existing } = await client.query(
        "SELECT id, email, role FROM users WHERE email = $1",
        [EMAIL]
    );

    if (existing.length > 0) {
        await client.query(
            "UPDATE users SET role = 'ADMIN', is_approved = true, password = $1, updated_at = NOW() WHERE email = $2",
            [hashedPassword, EMAIL]
        );
        console.log(`✅ 기존 계정을 ADMIN으로 업데이트: ${EMAIL}`);
    } else {
        await client.query(
            "INSERT INTO users (email, password, name, role, is_approved, created_at, updated_at) VALUES ($1, $2, $3, 'ADMIN', true, NOW(), NOW())",
            [EMAIL, hashedPassword, NAME]
        );
        console.log(`✅ 최고관리자 계정 생성: ${EMAIL}`);
    }

    const { rows } = await client.query(
        "SELECT id, email, name, role, is_approved FROM users WHERE email = $1",
        [EMAIL]
    );
    console.log("📋 계정 정보:", rows[0]);
    await client.end();
}

createAdmin().catch(console.error);

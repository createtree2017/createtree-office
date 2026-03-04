import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

const EMAIL = "9059056@gmail.com";
const PASSWORD = "123456";
const NAME = "최고관리자";

async function createAdmin() {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    const existing = await sql`SELECT id, email, role FROM users WHERE email = ${EMAIL}`;

    if (existing.length > 0) {
        await sql`
      UPDATE users 
      SET role = 'ADMIN', is_approved = true, password = ${hashedPassword}, updated_at = NOW()
      WHERE email = ${EMAIL}
    `;
        console.log(`✅ 기존 계정을 ADMIN으로 업데이트: ${EMAIL}`);
    } else {
        await sql`
      INSERT INTO users (email, password, name, role, is_approved, created_at, updated_at)
      VALUES (${EMAIL}, ${hashedPassword}, ${NAME}, 'ADMIN', true, NOW(), NOW())
    `;
        console.log(`✅ 최고관리자 계정 생성: ${EMAIL}`);
    }

    const result = await sql`SELECT id, email, name, role, is_approved FROM users WHERE email = ${EMAIL}`;
    console.log("📋 계정 정보:", result[0]);
    await sql.end();
}

createAdmin().catch(console.error);

import { db } from "./src/db/index.js";
import { users } from "./src/db/schema.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
    console.log("Seeding test admin user...");
    const hashedPassword = await bcrypt.hash("admin1234", 10);

    try {
        // 이메일이 중복되면 승인 상태와 역할을 업데이트
        await db.insert(users)
            .values({
                email: "admin@test.com",
                password: hashedPassword,
                name: "관리자",
                role: "ADMIN",
                isApproved: true,
            })
            .onConflictDoUpdate({
                target: users.email,
                set: {
                    isApproved: true,
                    role: "ADMIN",
                    password: hashedPassword
                }
            });
        console.log("Success: admin@test.com is now an APPROVED ADMIN.");
    } catch (err) {
        console.error("Error seeding admin user:", err);
    }
    process.exit(0);
}

seed();

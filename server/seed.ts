import { db } from "./src/db/index.js";
import { users } from "./src/db/schema.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
    console.log("Seeding test admin user...");
    const hashedPassword = await bcrypt.hash("admin1234", 10);

    try {
        await db.insert(users).values({
            email: "admin@test.com",
            password: hashedPassword,
            name: "관리자",
            role: "ADMIN",
            isApproved: true,
        });
        console.log("Success: admin@test.com / admin1234");
    } catch (err) {
        console.log("Admin user might already exist.");
    }
    process.exit(0);
}

seed();

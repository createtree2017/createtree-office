import { db } from "./src/db/index.js";
import { users } from "./src/db/schema.js";

async function testConnection() {
    try {
        const result = await db.select().from(users).limit(1);
        console.log("Connection successful, data:", result);
    } catch (err) {
        console.error("Connection failed:", err);
    }
    process.exit(0);
}

testConnection();

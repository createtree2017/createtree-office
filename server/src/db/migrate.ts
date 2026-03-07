import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const runMigration = async () => {
    console.log("Running migrations...");
    const connectionString = process.env.DATABASE_URL!;
    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);

    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("Migrations applied successfully!");
    process.exit(0);
};

runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});

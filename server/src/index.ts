import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import authRouter from "./routes/auth.js";
import manualsRouter from "./routes/manuals.js";
import adminRouter from "./routes/admin.js";
import tasksRouter from "./routes/tasks.js";
import webhookRouter from "./routes/webhook.js";
import driveRouter from "./routes/drive.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/manuals", manualsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/webhook", webhookRouter);
app.use("/api/drive", driveRouter);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "createTree Office API is running" });
});

// Production 환경에서 프론트엔드 정적 파일 서빙
if (process.env.NODE_ENV === "production") {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientBuildPath = path.join(__dirname, "../../../../client/dist");

    app.use(express.static(clientBuildPath));

    app.get("*", (req, res) => {
        res.sendFile(path.join(clientBuildPath, "index.html"));
    });
}

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRouter from "./routes/auth.js";
import manualsRouter from "./routes/manuals.js";
import adminRouter from "./routes/admin.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/manuals", manualsRouter);
app.use("/api/admin", adminRouter);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "createTree Office API is running" });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

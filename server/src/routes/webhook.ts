import express from "express";
import { db } from "../db/index.js";
import { formSubmissions } from "../db/schema.js";

const router = express.Router();

// 구글 앱스 스크립트에서 실시간 폼 제출 이벤트 시 호출하는 Webhook
router.post("/google-sync", async (req, res) => {
    try {
        const { secret, formId, rowIndex, timestamp, data } = req.body;

        // 간단한 시크릿 키 검증 (보안)
        if (secret !== process.env.GOOGLE_SYNC_SECRET && secret !== "createtree-sync-key") {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!formId || rowIndex === undefined) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        console.log(`[Webhook Recv] Form: ${formId}, Row: ${rowIndex}`);

        // DB에 삽입
        // (향후 Upsert 로직으로 고도화: googleRowIndex+formId 기준 기존 데이터 업데이트)
        await db.insert(formSubmissions).values({
            formId: formId,
            googleRowIndex: rowIndex,
            submittedData: data,
        });

        console.log(`[Webhook Success] Data saved to Neon DB`);
        res.json({ success: true, message: "Synced successfully" });

    } catch (error) {
        console.error("Webhook sync error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default router;

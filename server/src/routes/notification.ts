import { Router } from "express";
import { db } from "../db/index.js";
import { clients, notificationLogs } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { telegramService } from "../services/notification/telegramService.js";

const router = Router();

// ===== Telegram Webhook (봇 → 서버, 인증 불필요) =====
router.post("/telegram/webhook", async (req, res) => {
    try {
        await telegramService.handleWebhook(req.body);
        res.json({ ok: true });
    } catch (error: any) {
        console.error("Telegram webhook error:", error.message);
        res.json({ ok: true }); // Telegram은 항상 200 응답 필요
    }
});

// ===== Telegram Bot 정보 조회 =====
router.get("/telegram/info", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const botInfo = await telegramService.getBotInfo();
        if (botInfo) {
            res.json({ success: true, data: botInfo });
        } else {
            res.json({ success: false, message: "Bot 연결 실패. TOKEN을 확인하세요." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Bot 정보 조회 실패" });
    }
});

// ===== 거래처 Telegram 초대 링크 생성 =====
router.post("/telegram/invite/:clientId", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.clientId);
        if (isNaN(clientId)) return res.status(400).json({ success: false, message: "유효하지 않은 거래처 ID" });

        const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
        if (!client) return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });

        const code = await telegramService.generateInviteCode(clientId);
        const inviteUrl = telegramService.getInviteUrl(code);

        res.json({ success: true, data: { inviteCode: code, inviteUrl } });
    } catch (error: any) {
        console.error("Invite code error:", error.message);
        res.status(500).json({ success: false, message: "초대 코드 생성 실패" });
    }
});

// ===== 거래처 Telegram 연동 해제 =====
router.delete("/telegram/:clientId", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const clientId = parseInt(req.params.clientId);
        await db.update(clients)
            .set({
                telegramChatId: null,
                telegramConnectedAt: null,
                telegramInviteCode: null,
                updatedAt: new Date(),
            })
            .where(eq(clients.id, clientId));

        res.json({ success: true, message: "Telegram 연동이 해제되었습니다." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "연동 해제 실패" });
    }
});

// ===== 테스트 알림 발송 =====
router.post("/test", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
    try {
        const { clientId, message } = req.body;
        const [client] = await db.select().from(clients).where(eq(clients.id, clientId));

        if (!client?.telegramChatId) {
            return res.status(400).json({ success: false, message: "해당 거래처가 Telegram에 연동되어 있지 않습니다." });
        }

        const text = message || `🔔 테스트 알림\n\n${client.name}님, 알림이 정상적으로 작동합니다!`;
        const success = await telegramService.sendMessage(client.telegramChatId, text);

        // 이력 저장
        await db.insert(notificationLogs).values({
            clientId,
            channel: "telegram",
            messageType: "test",
            content: text,
            status: success ? "sent" : "failed",
        });

        if (success) {
            res.json({ success: true, message: "테스트 알림이 발송되었습니다." });
        } else {
            res.status(500).json({ success: false, message: "알림 발송에 실패했습니다." });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, message: "테스트 발송 실패" });
    }
});

// ===== 알림 이력 조회 =====
router.get("/logs", authenticateToken, async (req, res) => {
    try {
        const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

        let query = db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(limit);

        if (clientId) {
            query = query.where(eq(notificationLogs.clientId, clientId)) as any;
        }

        const logs = await query;
        res.json({ success: true, data: logs });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "알림 이력 조회 실패" });
    }
});

export default router;

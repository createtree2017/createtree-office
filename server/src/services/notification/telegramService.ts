import axios from "axios";
import { db } from "../../db/index.js";
import { clients, notificationLogs, monitoringTemplates } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Telegram Bot 알림 서비스
 * - 메시지 발송
 * - Webhook 처리 (거래처 /start → chat_id 자동 저장)
 * - 초대 코드 생성
 */
class TelegramService {

    /** 일반 텍스트 메시지 발송 */
    async sendMessage(chatId: string, text: string, parseMode: string = "Markdown"): Promise<boolean> {
        try {
            await axios.post(`${API_BASE}/sendMessage`, {
                chat_id: chatId,
                text,
                parse_mode: parseMode,
            }, { timeout: 10000 });
            return true;
        } catch (error: any) {
            console.error(`❌ Telegram 메시지 발송 실패 (chatId=${chatId}):`, error?.response?.data || error.message);
            return false;
        }
    }

    /** 모니터링 완료 알림 발송 */
    async sendMonitoringAlert(
        clientId: number,
        templateName: string,
        postsCount: number,
        summary: string | null,
        resultId: number,
        templateId: number,
        sentiment?: { positive: number; neutral: number; negative: number } | null,
    ): Promise<void> {
        try {
            // 거래처 Telegram 연동 확인
            const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
            if (!client?.telegramChatId) {
                console.log(`⚠️ 거래처 #${clientId} Telegram 미연동 - 알림 스킵`);
                return;
            }

            const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
            const sentimentLines = sentiment ? [
                `😊 긍정 ${sentiment.positive}건`,
                `😐 중립 ${sentiment.neutral}건`,
                `😟 부정 ${sentiment.negative}건`,
            ] : [];

            const message = [
                `🏥 *${this.escapeMarkdown(client.name)}*`,
                `📊 수집 ${postsCount}건 | ${now}`,
                ``,
                ...sentimentLines,
                sentimentLines.length ? `` : null,
                `📋 [보고서 확인](${process.env.APP_URL || "http://localhost:5173"}/monitoring)`,
            ].filter(v => v !== null).join("\n");

            const success = await this.sendMessage(client.telegramChatId, message);

            // 알림 이력 저장
            await db.insert(notificationLogs).values({
                clientId,
                channel: "telegram",
                messageType: "monitoring",
                content: message,
                status: success ? "sent" : "failed",
                errorMessage: success ? null : "메시지 발송 실패",
                templateId,
                resultId,
            });

            if (success) {
                console.log(`✅ Telegram 알림 발송 완료: ${client.name}`);
            }
        } catch (error: any) {
            console.error(`❌ Telegram 알림 처리 오류:`, error.message);
        }
    }

    /** Webhook으로 수신된 메시지 처리 (/start 명령 → chat_id 저장) */
    async handleWebhook(update: any): Promise<void> {
        try {
            const message = update?.message;
            if (!message?.text || !message?.chat?.id) return;

            const chatId = String(message.chat.id);
            const text = message.text.trim();

            // /start INV_거래처ID_코드 패턴 확인
            if (text.startsWith("/start")) {
                const parts = text.split(" ");
                const code = parts[1]; // INV_1_ABC123 형태

                if (code && code.startsWith("INV_")) {
                    // 초대 코드로 거래처 찾기
                    const [client] = await db.select()
                        .from(clients)
                        .where(eq(clients.telegramInviteCode, code));

                    if (client) {
                        // chat_id 저장 + 연동 완료
                        await db.update(clients)
                            .set({
                                telegramChatId: chatId,
                                telegramConnectedAt: new Date(),
                                updatedAt: new Date(),
                            })
                            .where(eq(clients.id, client.id));

                        // 환영 메시지 발송
                        await this.sendMessage(chatId, [
                            `✅ *알림 연동 완료!*`,
                            ``,
                            `🏥 *${this.escapeMarkdown(client.name)}*`,
                            ``,
                            `이제부터 모니터링 보고서가 자동으로 전송됩니다.`,
                            `알림을 중지하려면 /stop 을 입력하세요.`,
                        ].join("\n"));

                        console.log(`✅ Telegram 연동 완료: ${client.name} → chatId=${chatId}`);
                    } else {
                        await this.sendMessage(chatId, "⚠️ 유효하지 않은 초대 코드입니다. 관리자에게 문의해주세요.");
                    }
                } else {
                    // 코드 없이 /start만 누른 경우
                    await this.sendMessage(chatId, [
                        `👋 안녕하세요! createTree Office 알림 봇입니다.`,
                        ``,
                        `관리자로부터 받은 초대 링크를 통해 접속해주세요.`,
                    ].join("\n"));
                }
            }

            // /stop 명령 → 연동 해제
            if (text === "/stop") {
                const [client] = await db.select()
                    .from(clients)
                    .where(eq(clients.telegramChatId, chatId));

                if (client) {
                    await db.update(clients)
                        .set({
                            telegramChatId: null,
                            telegramConnectedAt: null,
                            updatedAt: new Date(),
                        })
                        .where(eq(clients.id, client.id));

                    await this.sendMessage(chatId, "🔕 알림이 해제되었습니다. 다시 연동하려면 관리자에게 문의하세요.");
                    console.log(`🔕 Telegram 연동 해제: ${client.name}`);
                }
            }
        } catch (error: any) {
            console.error(`❌ Telegram Webhook 처리 오류:`, error.message);
        }
    }

    /** 거래처별 초대 코드 생성 및 저장 */
    async generateInviteCode(clientId: number): Promise<string> {
        const code = `INV_${clientId}_${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

        await db.update(clients)
            .set({ telegramInviteCode: code, updatedAt: new Date() })
            .where(eq(clients.id, clientId));

        return code;
    }

    /** 초대 URL 생성 */
    getInviteUrl(inviteCode: string): string {
        // Bot username을 환경변수에서 가져오거나 기본값 사용
        return `https://t.me/createtree_bot?start=${inviteCode}`;
    }

    /** Bot 정보 가져오기 (연동 확인용) */
    async getBotInfo(): Promise<any> {
        try {
            const res = await axios.get(`${API_BASE}/getMe`, { timeout: 5000 });
            return res.data?.result || null;
        } catch (error: any) {
            console.error(`❌ Telegram Bot 정보 조회 실패:`, error.message);
            return null;
        }
    }

    /** 마크다운 특수문자 이스케이프 */
    private escapeMarkdown(text: string): string {
        return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
    }

    // ===== Long Polling (개발/배포 모두 사용 가능) =====
    private pollingActive = false;
    private lastUpdateId = 0;

    /** Polling 시작 — Telegram에서 새 메시지를 주기적으로 가져옴 */
    async startPolling(): Promise<void> {
        if (!BOT_TOKEN) {
            console.log("⚠️ TELEGRAM_BOT_TOKEN 미설정 — Polling 스킵");
            return;
        }

        // 먼저 기존 Webhook 해제 (Polling과 충돌 방지)
        try {
            await axios.post(`${API_BASE}/deleteWebhook`, {}, { timeout: 5000 });
        } catch (e) {
            // 무시
        }

        this.pollingActive = true;
        console.log("🤖 Telegram Bot Polling 시작...");

        this.poll();
    }

    /** Polling 중지 */
    stopPolling(): void {
        this.pollingActive = false;
        console.log("🤖 Telegram Bot Polling 중지");
    }

    /** 내부 polling 루프 */
    private async poll(): Promise<void> {
        while (this.pollingActive) {
            try {
                const res = await axios.get(`${API_BASE}/getUpdates`, {
                    params: {
                        offset: this.lastUpdateId + 1,
                        timeout: 10, // long polling 10초
                        allowed_updates: JSON.stringify(["message"]),
                    },
                    timeout: 15000,
                });

                const updates = res.data?.result || [];
                for (const update of updates) {
                    this.lastUpdateId = update.update_id;
                    await this.handleWebhook(update);
                }
            } catch (error: any) {
                if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
                    // 타임아웃은 정상 (long polling)
                    continue;
                }
                console.error("❌ Telegram Polling 오류:", error.message);
                // 에러 시 3초 대기 후 재시도
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
}

export const telegramService = new TelegramService();

// 서버 시작 시 자동으로 Polling 시작
setTimeout(() => {
    telegramService.startPolling().catch(err => {
        console.error("⚠️ Telegram Polling 시작 실패:", err.message);
    });
}, 2000);

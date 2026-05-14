export interface SalesEmailSendInput {
    to: string[];
    subject: string;
    html: string;
}

export interface SalesEmailSendResult {
    enabled: boolean;
    provider: "resend";
    messageId?: string;
    error?: string;
}

interface ResendSendResponse {
    id?: string;
    message?: string;
    name?: string;
    error?: string | { message?: string };
}

const RESEND_API_URL = "https://api.resend.com/emails";

function getSender(): string {
    const emailFrom = process.env.EMAIL_FROM || "";
    if (!emailFrom) return "";
    return emailFrom.includes("<") ? emailFrom : `createTree Office <${emailFrom}>`;
}

function getReplyTo(): string | undefined {
    return process.env.SALES_REPLY_TO || process.env.EMAIL_FROM || undefined;
}

function getResendError(data: ResendSendResponse): string {
    if (typeof data.error === "string") return data.error;
    if (data.error?.message) return data.error.message;
    return data.message || data.name || "Resend 발송 실패";
}

export function isSalesEmailSendingEnabled(): boolean {
    return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendSalesEmail(input: SalesEmailSendInput): Promise<SalesEmailSendResult> {
    if (!isSalesEmailSendingEnabled()) {
        return {
            enabled: false,
            provider: "resend",
            error: "Resend 발송 설정이 없습니다. RESEND_API_KEY와 EMAIL_FROM을 확인하세요.",
        };
    }

    try {
        const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: getSender(),
                to: input.to,
                subject: input.subject,
                html: input.html,
                reply_to: getReplyTo(),
            }),
        });
        const data = await response.json().catch(() => ({})) as ResendSendResponse;

        if (!response.ok || !data.id) {
            return {
                enabled: true,
                provider: "resend",
                error: getResendError(data),
            };
        }

        return { enabled: true, provider: "resend", messageId: data.id };
    } catch (error: any) {
        return { enabled: true, provider: "resend", error: error?.message || "Resend 발송 실패" };
    }
}

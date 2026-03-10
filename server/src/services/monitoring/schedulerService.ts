import { db } from "../../db/index.js";
import { monitoringTemplates } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * 스케줄러 서비스 - setInterval 기반 자동 모니터링 실행
 * node-cron의 async 콜백 문제를 우회하기 위해 네이티브 setInterval 사용
 */

interface ScheduleEntry {
    templateId: number;
    cronExpression: string;
    lastRunMinute: number;  // 마지막 실행된 분 (중복 실행 방지)
}

export class SchedulerService {
    private schedules: Map<number, ScheduleEntry> = new Map();
    private monitoringService: any = null;
    private tickInterval: ReturnType<typeof setInterval> | null = null;
    private failCounts: Map<number, number> = new Map();
    private serverStartedAt: Date = new Date();

    setMonitoringService(service: any) {
        this.monitoringService = service;
    }

    /** 서버 시작 시 활성화된 스케줄 등록 */
    async initializeSchedules() {
        try {
            const templates = await db.select().from(monitoringTemplates)
                .where(and(
                    eq(monitoringTemplates.isActive, true),
                    eq(monitoringTemplates.scheduleEnabled, true)
                ));

            for (const t of templates) {
                if (t.scheduleCron) {
                    this.registerSchedule(t.id, t.scheduleCron);
                }
            }
            console.log(`🕐 스케줄러 초기화 완료: ${templates.length}개 스케줄 등록됨 (PID: ${process.pid})`);
            this.startTicker();
        } catch (error) {
            console.error("❌ 스케줄러 초기화 실패:", error);
        }
    }

    /** 개별 스케줄 등록 (메모리에만 저장) */
    registerSchedule(templateId: number, cronExpression: string) {
        this.removeSchedule(templateId);

        this.schedules.set(templateId, {
            templateId,
            cronExpression,
            lastRunMinute: -1,
        });
        this.failCounts.set(templateId, 0);
        console.log(`✅ 스케줄 등록: 템플릿 #${templateId} → ${cronExpression}`);

        // ticker가 안 돌고 있으면 시작
        if (!this.tickInterval) this.startTicker();
    }

    /** ★ 핵심: 30초마다 체크하여 해당 분에 실행할 스케줄이 있으면 실행 */
    private startTicker() {
        if (this.tickInterval) clearInterval(this.tickInterval);

        console.log(`⏱️ 스케줄러 ticker 시작 (30초 간격, PID: ${process.pid})`);

        this.tickInterval = setInterval(() => {
            const now = new Date();
            const currentMinute = now.getHours() * 60 + now.getMinutes(); // 오늘의 분 (0~1439)

            for (const [templateId, entry] of this.schedules) {
                // 이미 이 분에 실행했으면 스킵
                if (entry.lastRunMinute === currentMinute) continue;

                // cron 표현식이 현재 시각과 매치하는지 확인
                if (this.shouldRun(entry.cronExpression, now)) {
                    entry.lastRunMinute = currentMinute;
                    console.log(`🔄 [스케줄] 자동 실행 트리거: 템플릿 #${templateId} (${now.toLocaleString("ko-KR")})`);

                    // 비동기 실행 — 절대 ticker를 블로킹하지 않음
                    this.safeExecute(templateId).catch(() => {});
                }
            }
        }, 30000); // 30초마다 체크
    }

    /** cron 표현식이 현재 시각과 매치하는지 간단 파싱 */
    private shouldRun(cronExpr: string, now: Date): boolean {
        try {
            const parts = cronExpr.trim().split(/\s+/);
            if (parts.length < 5) return false;

            const [minPart, hourPart] = parts;
            const currentMin = now.getMinutes();
            const currentHour = now.getHours();

            // 분 매칭
            if (!this.matchCronField(minPart, currentMin)) return false;
            // 시 매칭
            if (!this.matchCronField(hourPart, currentHour)) return false;

            return true;
        } catch {
            return false;
        }
    }

    // cron 필드 매칭: *, N, step(*/N), 콤마(N,N)
    private matchCronField(field: string, value: number): boolean {
        if (field === "*") return true;
        if (field.startsWith("*/")) {
            const interval = parseInt(field.substring(2));
            return interval > 0 && value % interval === 0;
        }
        // 콤마 구분 (0,15,30,45 등)
        const values = field.split(",").map(v => parseInt(v.trim()));
        return values.includes(value);
    }

    /** 안전한 실행 래퍼 — 어떤 에러가 나도 ticker를 죽이지 않음 */
    private async safeExecute(templateId: number): Promise<void> {
        const failCount = this.failCounts.get(templateId) || 0;

        try {
            if (!this.monitoringService) {
                const { MonitoringService } = await import("./monitoringService.js");
                this.monitoringService = new MonitoringService();
            }

            // 템플릿 생성자를 실행자로 사용 (FK 제약조건 충족)
            const [tmpl] = await db.select({ createdBy: monitoringTemplates.createdBy })
                .from(monitoringTemplates)
                .where(eq(monitoringTemplates.id, templateId));
            const userId = tmpl?.createdBy || 0;

            await this.monitoringService.executeMonitoring(templateId, userId);

            try {
                await db.update(monitoringTemplates)
                    .set({ scheduleLastRunAt: new Date() })
                    .where(eq(monitoringTemplates.id, templateId));
            } catch (dbErr) {
                console.error(`⚠️ [스케줄] scheduleLastRunAt 업데이트 실패:`, dbErr);
            }

            this.failCounts.set(templateId, 0);
            console.log(`✅ [스케줄] 자동 실행 완료: 템플릿 #${templateId}`);

        } catch (error) {
            const newFailCount = failCount + 1;
            this.failCounts.set(templateId, newFailCount);
            console.error(`❌ [스케줄] 자동 실행 실패 (${newFailCount}회 연속): 템플릿 #${templateId}`, error instanceof Error ? error.message : error);
        }
    }

    /** 스케줄 제거 */
    removeSchedule(templateId: number) {
        this.schedules.delete(templateId);
        this.failCounts.delete(templateId);
    }

    /** 템플릿 업데이트 시 스케줄 갱신 */
    updateSchedule(templateId: number, enabled: boolean, cronExpression?: string | null) {
        if (enabled && cronExpression) {
            this.registerSchedule(templateId, cronExpression);
        } else {
            this.removeSchedule(templateId);
        }
    }

    /** 등록된 스케줄 목록 (디버그용) */
    getActiveSchedules() {
        return {
            pid: process.pid,
            serverStartedAt: this.serverStartedAt.toISOString(),
            uptime: Math.floor((Date.now() - this.serverStartedAt.getTime()) / 1000),
            tickerAlive: this.tickInterval !== null,
            tasks: Array.from(this.schedules.entries()).map(([id, entry]) => ({
                templateId: id,
                cronExpression: entry.cronExpression,
                lastRunMinute: entry.lastRunMinute,
                failCount: this.failCounts.get(id) || 0,
            })),
        };
    }
}

export const schedulerService = new SchedulerService();

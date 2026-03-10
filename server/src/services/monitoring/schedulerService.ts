import cron, { ScheduledTask } from "node-cron";
import { db } from "../../db/index.js";
import { monitoringTemplates, monitoringResults } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * 스케줄러 서비스 - node-cron 기반 자동 모니터링 실행
 */
export class SchedulerService {
    private tasks: Map<number, ScheduledTask> = new Map();
    private monitoringService: any = null;

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
            console.log(`🕐 스케줄러 초기화 완료: ${templates.length}개 스케줄 등록됨`);
        } catch (error) {
            console.error("❌ 스케줄러 초기화 실패:", error);
        }
    }

    /** 개별 스케줄 등록 */
    registerSchedule(templateId: number, cronExpression: string) {
        // 기존 스케줄 제거
        this.removeSchedule(templateId);

        if (!cron.validate(cronExpression)) {
            console.error(`❌ 유효하지 않은 cron: ${cronExpression} (template: ${templateId})`);
            return;
        }

        const task = cron.schedule(cronExpression, async () => {
            console.log(`🔄 [스케줄] 자동 실행: 템플릿 #${templateId} (${new Date().toLocaleString("ko-KR")})`);
            try {
                if (this.monitoringService) {
                    await this.monitoringService.executeMonitoring(templateId, 0); // system user
                    // 마지막 실행 시간 업데이트
                    await db.update(monitoringTemplates)
                        .set({ scheduleLastRunAt: new Date() })
                        .where(eq(monitoringTemplates.id, templateId));
                }
            } catch (error) {
                console.error(`❌ [스케줄] 자동 실행 실패: 템플릿 #${templateId}`, error);
            }
        }, { timezone: "Asia/Seoul" });

        this.tasks.set(templateId, task);
        console.log(`✅ 스케줄 등록: 템플릿 #${templateId} → ${cronExpression}`);
    }

    /** 스케줄 제거 */
    removeSchedule(templateId: number) {
        const existing = this.tasks.get(templateId);
        if (existing) {
            existing.stop();
            this.tasks.delete(templateId);
        }
    }

    /** 템플릿 업데이트 시 스케줄 갱신 */
    updateSchedule(templateId: number, enabled: boolean, cronExpression?: string | null) {
        if (enabled && cronExpression) {
            this.registerSchedule(templateId, cronExpression);
        } else {
            this.removeSchedule(templateId);
        }
    }

    /** 등록된 스케줄 목록 */
    getActiveSchedules(): { templateId: number; isRunning: boolean }[] {
        return Array.from(this.tasks.entries()).map(([id, task]) => ({
            templateId: id,
            isRunning: true,
        }));
    }
}

export const schedulerService = new SchedulerService();

// 동적 import 시 싱글톤 테스트
const mod1 = await import('./src/services/monitoring/schedulerService.js');
const mod2 = await import('./src/services/monitoring/schedulerService.js');

console.log('같은 인스턴스?', mod1.schedulerService === mod2.schedulerService);
console.log('tasks Map 크기:', mod1.schedulerService.getActiveSchedules().length);
console.log('활성 스케줄:', mod1.schedulerService.getActiveSchedules());

// monitoringService 설정 여부 확인
console.log('monitoringService 존재?', !!(mod1.schedulerService as any).monitoringService);

process.exit(0);

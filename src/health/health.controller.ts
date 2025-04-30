// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { 
  HealthCheckService, 
  HttpHealthIndicator, 
  HealthCheck, 
  DiskHealthIndicator,
  MemoryHealthIndicator,
  HealthIndicatorStatus,
  HealthIndicatorResult
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private disk: DiskHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Basic ping check
      () => Promise.resolve({ ping: { status: "up" as HealthIndicatorStatus } }),
      
      // Memory check - max 70% heap usage
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
      
      // Storage check - max 90% disk usage
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
      
      // External service check - TTS service
      () => this.http.pingCheck('tts_service', `${process.env.FLASK_URL}/api/tts`),
    ]);
  }

  @Get('ping')
  ping() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
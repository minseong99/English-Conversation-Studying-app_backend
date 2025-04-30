// src/session/session.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.REDIS_REST_URL!,
      token: process.env.REDIS_REST_TOKEN!,
    });
  }

  async onModuleInit() {
    this.logger.log('Upstash Redis client initialized');
  }

  async saveSession(sessionId: string, newMessage: any) {
    const key = `session:${sessionId}`;
    // 기존 메시지 불러오기 (없으면 빈 배열)
    const existing = (await this.redis.get(key)) as any[] || [];
    const messages = [...existing.slice(-99), newMessage];
    await this.redis.set(key, messages);
  }

  async getSession(sessionId: string): Promise<any[]> {
    const key = `session:${sessionId}`;
    const data = await this.redis.get(key);
    return Array.isArray(data) ? data : [];
  }

  async deleteSession(sessionId: string) {
    const key = `session:${sessionId}`;
    await this.redis.del(key);
  }

  onModuleDestroy() {
    this.logger.log('SessionService cleanup (no explicit disconnect needed)');
  }
}




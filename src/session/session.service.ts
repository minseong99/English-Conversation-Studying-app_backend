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
    this.logger.log('Upstash Redis REST client initialized');
  }

  async onModuleInit() {
    // Upstash REST는 따로 connect/disconnect 불필요
    this.logger.log('SessionService ready');
  }

  async saveSession(sessionId: string, newMessage: any) {
    const key = `session:${sessionId}`;
    // GET existing array or []
    const existing = await this.redis.get<string>(key);
    const messages = existing ? JSON.parse(existing) : [];
    if (messages.length >= 100) messages.shift();
    messages.push(newMessage);
    await this.redis.set(key, JSON.stringify(messages), { ex: 3600 });
    return true;
  }

  async getSession(sessionId: string) {
    const key = `session:${sessionId}`;
    const data = await this.redis.get<string>(key);
    return data ? JSON.parse(data) : [];
  }

  async deleteSession(sessionId: string) {
    const key = `session:${sessionId}`;
    await this.redis.del(key);
    return true;
  }

  async onModuleDestroy() {
    // Upstash REST는 닫을 리소스 없음
    this.logger.log('SessionService destroyed');
  }
}




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
    // 1) 기존 세션 가져오기
    const existing = await this.redis.get<any>(key);
  
    // 2) existing이 JSON 문자열이면 파싱, 이미 배열이면 그대로, 그 외엔 빈 배열
    let messages: any[];
    if (typeof existing === 'string') {
      try {
        messages = JSON.parse(existing);
      } catch (e) {
        this.logger.warn(`Failed to JSON.parse existing session, initializing new array. value=`, existing);
        messages = [];
      }
    } else if (Array.isArray(existing)) {
      messages = existing;
    } else {
      messages = [];
    }
  
    // 3) 메시지 제한
    if (messages.length >= 100) {
      messages.shift();
    }
  
    // 4) 새 메시지 추가
    messages.push(newMessage);
  
    // 5) Redis에 문자열로 저장 (TTL 1시간)
    await this.redis.set(key, JSON.stringify(messages), { ex: 3600 });
    return true;
  }

  async getSession(sessionId: string) {
    const key = `session:${sessionId}`;
    const data = await this.redis.get<any>(key);
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        this.logger.warn(`Failed to JSON.parse session data. Returning empty array.`);
        return [];
      }
    } else if (Array.isArray(data)) {
      return data;
    }
    return [];
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




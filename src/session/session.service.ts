// src/session/session.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private client: RedisClientType;

  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.connect();
  }

  async saveSession(sessionId: string, data: any) {
    // TTL 1시간(3600초) 설정
    await this.client.set(sessionId, JSON.stringify(data), { EX: 3600 });
  }

  async getSession(sessionId: string) {
    const data = await this.client.get(sessionId);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string) {
    await this.client.del(sessionId);
  }

  async onModuleDestroy() {
    await this.client.disconnect();
  }
}

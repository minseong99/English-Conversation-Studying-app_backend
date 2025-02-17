// src/session/session.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private client: RedisClientType;

  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    if (process.env.NODE_ENV !== 'test') {
      this.client.connect();
    }
  }

  // 새 메시지를 누적하여 저장 (메시지 배열 형태)
  async saveSession(sessionId: string, newMessage: any) {
    const existingData = await this.client.get(sessionId);
    let messages = existingData ? JSON.parse(existingData) : [];
    messages.push(newMessage);
    await this.client.set(sessionId, JSON.stringify(messages), { EX: 3600 });
  }

  async getSession(sessionId: string) {
    const data = await this.client.get(sessionId);
    return data ? JSON.parse(data) : [];
  }

  async deleteSession(sessionId: string) {
    await this.client.del(sessionId);
  }

  async onModuleDestroy() {
    await this.client.disconnect();
  }
}



// src/session/session.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { createClient, RedisClientType, RedisClientOptions } from 'redis';

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly logger = new Logger(SessionService.name);
  private readonly connectionOptions: RedisClientOptions;

  constructor() {
    // Configure Redis with connection pool and retries
    this.connectionOptions = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: (retries) => {
          // Exponential backoff with max delay and retry limits
          const delay = Math.min(Math.pow(2, retries) * 100, 10000);
          this.logger.warn(`Redis reconnect attempt ${retries}, delay: ${delay}ms`);
          return delay;
        },
      },
      database: parseInt(process.env.REDIS_DB || '0'),
      password: process.env.REDIS_PASSWORD || undefined,
    };
    
    this.client = createClient(this.connectionOptions) as RedisClientType;
    
    // Set up event handlers
    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });
    
    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });
    
    this.client.on('reconnecting', () => {
      this.logger.warn('Redis client reconnecting');
    });
  }

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      try {
        await this.client.connect();
        this.logger.log('Redis connection initialized');
      } catch (error) {
        this.logger.error('Failed to initialize Redis connection', error);
        // Allow app to continue, it will try to reconnect as needed
      }
    }
  }

  // 새 메시지를 누적하여 저장 (메시지 배열 형태)
  async saveSession(sessionId: string, newMessage: any) {
    try {
      const existingData = await this.client.get(sessionId);
      let messages = existingData ? JSON.parse(existingData) : [];
      
      // Keep max 100 messages per session to avoid excessive memory usage
      if (messages.length >= 100) {
        messages = messages.slice(-99);
      }
      
      messages.push(newMessage);
      
      // Use multi/exec for atomic operations
      await this.client
        .multi()
        .set(sessionId, JSON.stringify(messages))
        .expire(sessionId, 3600) // TTL 1 hour
        .exec();
        
      return true;
    } catch (error) {
      this.logger.error(`Error saving session ${sessionId}:`, error);
      
      // Attempt to reconnect on failure
      if (!this.client.isOpen) {
        try {
          await this.client.connect();
        } catch (connError) {
          this.logger.error('Failed to reconnect to Redis:', connError);
        }
      }
      
      throw error;
    }
  }

  async getSession(sessionId: string) {
    try {
      const data = await this.client.get(sessionId);
      
      // Reset TTL on read to prevent session timeout during active use
      if (data) {
        await this.client.expire(sessionId, 3600); // Reset to 1 hour
      }
      
      return data ? JSON.parse(data) : [];
    } catch (error) {
      this.logger.error(`Error getting session ${sessionId}:`, error);
      
      // Attempt to reconnect on failure
      if (!this.client.isOpen) {
        try {
          await this.client.connect();
        } catch (connError) {
          this.logger.error('Failed to reconnect to Redis:', connError);
        }
      }
      
      return []; // Return empty array on error to avoid breaking the application
    }
  }

  async deleteSession(sessionId: string) {
    try {
      await this.client.del(sessionId);
      return true;
    } catch (error) {
      this.logger.error(`Error deleting session ${sessionId}:`, error);
      
      // Attempt to reconnect on failure
      if (!this.client.isOpen) {
        try {
          await this.client.connect();
        } catch (connError) {
          this.logger.error('Failed to reconnect to Redis:', connError);
        }
      }
      
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      if (this.client.isOpen) {
        await this.client.disconnect();
        this.logger.log('Redis connection closed');
      }
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error);
    }
  }
}



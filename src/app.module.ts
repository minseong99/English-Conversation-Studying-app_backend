// src/app.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD } from '@nestjs/core';
import { redisStore } from 'cache-manager-redis-store';

import { ChatModule } from './chat/chat.module';
import { SessionModule } from './session/session.module';
import { SpeechModule } from './speech/speech.module';
import { WordChainModule } from './wordchain/wordchain.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';

import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerModuleOptions } from '@nestjs/throttler/dist/interfaces';
import Redis from 'ioredis';



@Module({
  imports: [
    // 1) ThrottlerModule를 Upstash Redis 기반으로 설정
    ThrottlerModule.forRootAsync({
      useFactory: (): ThrottlerModuleOptions => ({
        ttl: 60,
        limit: 30,
        storage: new ThrottlerStorageRedisService(
          new Redis(process.env.REDIS_URL || ''),
        ),
      }),
    }),

    // 2) CacheModule 역시 Upstash Redis REST 로 통일
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async() => ({
        store: await redisStore({
          url: process.env.REDIS_URL!,
        }),
        ttl: 60 * 5,       // 5분 캐시
      }),
    }),

    // Application modules
    ChatModule,
    SessionModule,
    SpeechModule,
    WordChainModule,
    GameModule,
    HealthModule,
  ],

  // ThrottlerGuard 를 전역으로 활성화
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// src/app.module.ts
import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { SessionModule } from './session/session.module';
import { SpeechModule } from './speech/speech.module';
import { WordChainModule } from './wordchain/wordchain.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Module({
  imports: [
    // Rate limiting protection
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,// time-to-live in seconds
          limit: 30,// max number of requests within TTL
        },
      ],
    }),
    
    // Global caching with Redis
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: await redisStore({
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          ttl: 60 * 5, // Default 5 minutes cache TTL
        }),
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
})
export class AppModule {}
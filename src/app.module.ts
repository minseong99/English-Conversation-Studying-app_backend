import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { SessionModule } from './session/session.module';
import { SpeechModule } from './speech/speech.module';
import { WordChainModule } from './wordchain/wordchain.module';
import { GameModule } from './game/game.module';
import { environmentConfig } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: environmentConfig.validate,
      envFilePath: [
        `.env.${process.env.NODE_ENV}`,
        '.env'
      ]
    }),
    ChatModule, 
    SessionModule, 
    SpeechModule, 
    WordChainModule, 
    GameModule
  ],
})
export class AppModule {}
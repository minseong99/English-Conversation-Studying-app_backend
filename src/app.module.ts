// src/app.module.ts
import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { SessionModule } from './session/session.module';
import { SpeechModule } from './speech/speech.module';
import { WordChainModule } from './wordchain/wordchain.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [ChatModule, SessionModule, SpeechModule, WordChainModule, GameModule],
})
export class AppModule {}

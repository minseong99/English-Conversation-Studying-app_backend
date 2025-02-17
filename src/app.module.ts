// src/app.module.ts
import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { SpeechModule } from './speech/speech.module'; // 향후 음성 관련 기능
import { SessionModule } from './session/session.module';
// (세션, 발음 모듈은 ChatModule이나 별도로 제공 가능)

@Module({
  imports: [ChatModule, SessionModule ,SpeechModule],
})
export class AppModule {}

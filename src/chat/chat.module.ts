// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SessionService } from '../session/session.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, SessionService],
})
export class ChatModule {}

// src/chat/chat.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async sendMessage(
    @Body() body: { message: string; strategy: string; sessionId: string },
  ) {
    const { message, strategy, sessionId } = body;
    const response = await this.chatService.handleMessage(message, strategy, sessionId);
    return response;
  }
}

// src/chat/chat.controller.ts
import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async sendMessage(@Body() body: { message: string;sessionId: string }) {
    if (!body || !body.message  || !body.sessionId) {
      throw new BadRequestException('필수 필드(message, sessionId)가 누락되었습니다.');
    }
    const { message, sessionId } = body;
    const response = await this.chatService.handleMessage(message,  sessionId);
    return response;
  }
}

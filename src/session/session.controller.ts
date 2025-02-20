// src/session/session.controller.ts
// 세션 데이터 조회
import { Controller, Get, Delete, Param } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('api/session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get(':sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const messages = await this.sessionService.getSession(sessionId);
    return { messages };
  }

  @Delete(':sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    await this.sessionService.deleteSession(sessionId);
    return { message: 'Session cleared' };
  }

}

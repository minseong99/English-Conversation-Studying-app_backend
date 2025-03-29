// src/game/game.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('api/game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('start')
  async startGame(@Body() body: { sessionId: string; difficulty?: string }) {
    const { sessionId, difficulty = 'basic' } = body;
    const gameState = await this.gameService.startGame(sessionId, difficulty);
    return { 
      gameState,
      message: `Game started with a ${difficulty} difficulty level word: ${gameState.currentWord}`
    };
  }

  @Post('verify')
  async verifyAnswer(@Body() body: { sessionId: string; answer: string }) {
    const { sessionId, answer } = body;
    const result = await this.gameService.verifyAnswer(sessionId, answer);
    return result;
  }

  @Post('hint')
  async getHint(@Body() body: { sessionId: string }) {
    const { sessionId } = body;
    const hint = await this.gameService.getHint(sessionId);
    return hint;
  }

  @Get('state/:sessionId')
  async getGameState(@Param('sessionId') sessionId: string) {
    const gameState = await this.gameService.getGameState(sessionId);
    return { gameState };
  }
}

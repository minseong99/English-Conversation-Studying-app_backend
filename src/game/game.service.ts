// src/game/game.service.ts
import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { WordChainService, WordChain } from '../wordchain/wordchain.service';

export interface GameState {
  currentWord: string;
  hintCount: number;
}

@Injectable()
export class GameService {
  private redisClient: RedisClientType;
  private readonly redisKeyPrefix = 'game:';

  constructor(private readonly wordChainService: WordChainService) {
    this.redisClient = createClient();
    this.redisClient.on('error', (err) => console.error('Redis Client Error (GameService):', err));
    this.redisClient.connect();
  }

  private getGameKey(sessionId: string): string {
    return `${this.redisKeyPrefix}${sessionId}`;
  }

  // 게임 시작: 초기 AI 단어를 생성하고 게임 상태를 저장
  async startGame(sessionId: string): Promise<GameState> {
    try {
      const wordData: WordChain = await this.wordChainService.getRandomWord();
      const gameState: GameState = {
        currentWord: wordData.word,
        hintCount: 0,
      };
      await this.redisClient.set(this.getGameKey(sessionId), JSON.stringify(gameState));
      return gameState;
    } catch (error) {
      console.error('Error starting game:', error);
      throw new InternalServerErrorException('Could not start game');
    }
  }

  // 게임 상태 조회
  async getGameState(sessionId: string): Promise<GameState> {
    const data = await this.redisClient.get(this.getGameKey(sessionId));
    if (!data) {
      throw new BadRequestException('Game state not found for session');
    }
    return JSON.parse(data) as GameState;
  }

  // 사용자의 답변 검증 및 새 라운드 진행
  async verifyAnswer(sessionId: string, answer: string): Promise<{ correct: boolean; newWord?: string; message: string }> {
    const gameState = await this.getGameState(sessionId);
    const lastLetter = gameState.currentWord.slice(-1).toLowerCase();
    const answerFirstLetter = answer.trim()[0].toLowerCase();
    if (answerFirstLetter !== lastLetter) {
      // 정답이 틀린 경우
      return {
        correct: false,
        message: `Incorrect! Your word should start with "${lastLetter}". Game over.`,
      };
    }
    // 정답이 맞으면, 사용자의 단어 마지막 글자를 기준으로 새로운 단어 생성
    const requiredLetter = answer.trim().slice(-1).toLowerCase();
    const newWordData = await this.wordChainService.getRandomWordWithLetter(requiredLetter);
    gameState.currentWord = newWordData.word;
    gameState.hintCount = 0; // 라운드가 바뀌면 힌트 카운트 초기화
    await this.redisClient.set(this.getGameKey(sessionId), JSON.stringify(gameState));
    return {
      correct: true,
      newWord: newWordData.word,
      message: 'Correct answer! Continue the game.',
    };
  }

  // 힌트 제공: 현재 AI 단어의 마지막 글자에 맞는 후보 단어와 정의 제공
  async getHint(sessionId: string): Promise<{ hint: string }> {
    const gameState = await this.getGameState(sessionId);
    if (gameState.hintCount >= 3) {
      return { hint: 'No more hints available for this round.' };
    }
    const requiredLetter = gameState.currentWord.slice(-1).toLowerCase();
    const hintData = await this.wordChainService.getRandomWordWithLetter(requiredLetter);
    gameState.hintCount += 1;
    await this.redisClient.set(this.getGameKey(sessionId), JSON.stringify(gameState));
    return { hint: `Try a word like "${hintData.word}" (${hintData.hint})` };
  }
}

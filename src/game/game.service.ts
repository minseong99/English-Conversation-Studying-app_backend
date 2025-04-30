// src/game/game.service.ts
import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { WordChainService, WordChain } from '../wordchain/wordchain.service';

export interface GameState {
  currentWord: string;
  hintCount: number;
  difficulty: string; // 난이도 추가 (basic, intermediate)
  score: number; // 점수 추가
  streak: number; // 연속 정답 추가
}

@Injectable()
export class GameService {
  private redisClient: RedisClientType;
  private readonly redisKeyPrefix = 'game:';

  constructor(private readonly wordChainService: WordChainService) {
    // this.redisClient = createClient();
    // this.redisClient.on('error', (err) => console.error('Redis Client Error (GameService):', err));
    // this.redisClient.connect();
    this.redisClient = createClient({
      url: process.env.REDIS_URL
    });
    this.redisClient.on('error', (err) => console.error('Redis Client Error (GameService):', err));
    this.redisClient.connect();
  }

  private getGameKey(sessionId: string): string {
    return `${this.redisKeyPrefix}${sessionId}`;
  }

  // 게임 시작: 초기 AI 단어를 생성하고 게임 상태를 저장
  async startGame(sessionId: string, difficulty: string = 'basic'): Promise<GameState> {
    try {
      const wordData: WordChain = await this.wordChainService.getRandomWord();
      const gameState: GameState = {
        currentWord: wordData.word,
        hintCount: 0,
        difficulty: difficulty,
        score: 0,
        streak: 0
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
  async verifyAnswer(sessionId: string, answer: string): Promise<{ 
    correct: boolean; 
    newWord?: string; 
    message: string;
    score?: number;
    streak?: number;
  }> {
    const gameState = await this.getGameState(sessionId);
    const lastLetter = gameState.currentWord.slice(-1).toLowerCase();
    
    // Clean up user input
    const cleanAnswer = answer.trim().toLowerCase();
    if (cleanAnswer.length === 0) {
      return {
        correct: false,
        message: "Please enter a valid word."
      };
    }
    
    const answerFirstLetter = cleanAnswer[0].toLowerCase();
    
    if (answerFirstLetter !== lastLetter) {
      // Reset streak on wrong answer
      gameState.streak = 0;
      await this.redisClient.set(this.getGameKey(sessionId), JSON.stringify(gameState));
      
      return {
        correct: false,
        message: `Incorrect! Your word should start with "${lastLetter}". Game continues, but streak is reset.`,
        score: gameState.score,
        streak: 0
      };
    }
    
    // 정답이 맞으면, 사용자의 단어 마지막 글자를 기준으로 새로운 단어 생성
    const requiredLetter = cleanAnswer.slice(-1).toLowerCase();
    const newWordData = await this.wordChainService.getRandomWordWithLetter(requiredLetter);
    
    // Update game state
    gameState.currentWord = newWordData.word;
    gameState.hintCount = 0; // 라운드가 바뀌면 힌트 카운트 초기화
    gameState.score += 10; // 기본 점수 10점
    gameState.streak += 1; // 연속 정답 스트릭 증가
    
    // Add bonus points for streak
    if (gameState.streak > 1) {
      const bonusPoints = Math.min(gameState.streak * 2, 20); // Max 20 bonus points
      gameState.score += bonusPoints;
    }
    
    await this.redisClient.set(this.getGameKey(sessionId), JSON.stringify(gameState));
    
    return {
      correct: true,
      newWord: newWordData.word,
      message: `Correct answer! +${10 + (gameState.streak > 1 ? Math.min(gameState.streak * 2, 20) : 0)} points.`,
      score: gameState.score,
      streak: gameState.streak
    };
  }

  // 향상된 힌트 제공: 가능한 다음 단어들 제안
  async getHint(sessionId: string): Promise<{ 
    hint: string;
    possibleWords?: string[];
    hintCount?: number; 
  }> {
    const gameState = await this.getGameState(sessionId);
    
    if (gameState.hintCount >= 3) {
      return { 
        hint: 'No more hints available for this round.',
        hintCount: gameState.hintCount
      };
    }
    
    const requiredLetter = gameState.currentWord.slice(-1).toLowerCase();
    
    // Get multiple possible next words
    const nextWords = await this.wordChainService.getPossibleNextWords(gameState.currentWord, 3);
    
    let hintMessage: string;
    let possibleWords: string[] = [];
    
    if (nextWords.length === 0) {
      hintMessage = `Try to think of a word that starts with "${requiredLetter}".`;
    } else {
      possibleWords = nextWords.map(w => w.word);
      
      if (gameState.hintCount === 0) {
        // First hint: just the required letter
        hintMessage = `You need a word that starts with "${requiredLetter}".`;
      } else if (gameState.hintCount === 1) {
        // second hint: example word with definition
        hintMessage = `${nextWords[0].hint}`;
      } else {
        // third hint: example word without definition
        hintMessage = `Try a word like "${nextWords[0].word}".`;
      }
    }
    
    // Update hint count in game state
    gameState.hintCount += 1;
    await this.redisClient.set(this.getGameKey(sessionId), JSON.stringify(gameState));
    
    return { 
      hint: hintMessage,
      possibleWords: possibleWords,
      hintCount: gameState.hintCount
    };
  }
}

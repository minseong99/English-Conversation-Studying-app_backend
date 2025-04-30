// src/game/game.service.ts
import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import { WordChainService, WordChain } from '../wordchain/wordchain.service';

export interface GameState {
  currentWord: string;
  hintCount: number;
  difficulty: string;
  score: number;
  streak: number;
}

@Injectable()
export class GameService {
  private readonly redis: Redis;
  private readonly prefix = 'game:';

  constructor(private readonly wordChainService: WordChainService) {
    this.redis = new Redis({
      url: process.env.REDIS_REST_URL!,
      token: process.env.REDIS_REST_TOKEN!,
    });
  }

  private key(sessionId: string) {
    return `${this.prefix}${sessionId}`;
  }

  async startGame(sessionId: string, difficulty = 'basic'): Promise<GameState> {
    try {
      const wordData: WordChain = await this.wordChainService.getRandomWord();
      const state: GameState = {
        currentWord: wordData.word,
        hintCount: 0,
        difficulty,
        score: 0,
        streak: 0,
      };
      await this.redis.set(this.key(sessionId), state);
      return state;
    } catch (error) {
      throw new InternalServerErrorException('Could not start game');
    }
  }

  async getGameState(sessionId: string): Promise<GameState> {
    const data = await this.redis.get(this.key(sessionId));
    if (!data) throw new BadRequestException('Game state not found');
    return data as GameState;
  }

  async verifyAnswer(
    sessionId: string,
    answer: string,
  ): Promise<{
    correct: boolean;
    newWord?: string;
    message: string;
    score?: number;
    streak?: number;
  }> {
    const state = await this.getGameState(sessionId);
    const lastLetter = state.currentWord.slice(-1).toLowerCase();
    const clean = answer.trim().toLowerCase();
    if (!clean) {
      return { correct: false, message: 'Please enter a valid word.' };
    }
    if (clean[0] !== lastLetter) {
      state.streak = 0;
      await this.redis.set(this.key(sessionId), state);
      return {
        correct: false,
        message: `Incorrect! Word must start with "${lastLetter}". Streak reset.`,
        score: state.score,
        streak: 0,
      };
    }
    const required = clean.slice(-1).toLowerCase();
    const newWordData = await this.wordChainService.getRandomWordWithLetter(required);
    state.currentWord = newWordData.word;
    state.hintCount = 0;
    state.score += 10;
    state.streak += 1;
    if (state.streak > 1) {
      const bonus = Math.min(state.streak * 2, 20);
      state.score += bonus;
    }
    await this.redis.set(this.key(sessionId), state);
    return {
      correct: true,
      newWord: newWordData.word,
      message: `Correct! +${10 + (state.streak > 1 ? Math.min(state.streak * 2, 20) : 0)} points.`,
      score: state.score,
      streak: state.streak,
    };
  }

  async getHint(sessionId: string): Promise<{
    hint: string;
    possibleWords?: string[];
    hintCount?: number;
  }> {
    const state = await this.getGameState(sessionId);
    if (state.hintCount >= 3) {
      return { hint: 'No more hints available.', hintCount: state.hintCount };
    }
    const required = state.currentWord.slice(-1).toLowerCase();
    const nexts = await this.wordChainService.getPossibleNextWords(state.currentWord, 3);
    let hintMessage: string;
    if (nexts.length === 0) {
      hintMessage = `Try a word starting with "${required}".`;
    } else {
      if (state.hintCount === 0) {
        hintMessage = `Word must start with "${required}".`;
      } else if (state.hintCount === 1) {
        hintMessage = `Example: "${nexts[0].word}".`;
      } else {
        hintMessage = `${nexts[0].hint}.`;
      }
    }
    state.hintCount += 1;
    await this.redis.set(this.key(sessionId), state);
    return { hint: hintMessage, possibleWords: nexts.map(w => w.word), hintCount: state.hintCount };
  }
}


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
      const { word } = await this.wordChainService.getRandomWord();
      const state: GameState = { currentWord: word, hintCount: 0, difficulty, score: 0, streak: 0 };
      await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
      return state;
    } catch (e) {
      throw new InternalServerErrorException('Could not start game');
    }
  }

  async getGameState(sessionId: string): Promise<GameState> {
    const data = await this.redis.get<string>(this.key(sessionId));
    if (!data) throw new BadRequestException('No game found');
    return JSON.parse(data);
  }

  async verifyAnswer(sessionId: string, answer: string) {
    const state = await this.getGameState(sessionId);
    const last = state.currentWord.slice(-1).toLowerCase();
    const ans = answer.trim().toLowerCase();
    if (ans[0] !== last) {
      state.streak = 0;
      await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
      return { correct: false, message: `Must start with "${last}"`, score: state.score, streak: 0 };
    }
    const next = await this.wordChainService.getRandomWordWithLetter(ans.slice(-1));
    state.currentWord = next.word;
    state.hintCount = 0;
    state.streak++;
    state.score += 10 + Math.min(state.streak * 2, 20);
    await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
    return { correct: true, newWord: next.word, message: 'Correct!', score: state.score, streak: state.streak };
  }

  async getHint(sessionId: string) {
    const state = await this.getGameState(sessionId);
    if (state.hintCount >= 3) return { hint: 'No hints left', hintCount: state.hintCount };
    const next = await this.wordChainService.getPossibleNextWords(state.currentWord, 1);
    state.hintCount++;
    await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
    return { hint: next[0]?.definition ?? `Starts with "${state.currentWord.slice(-1)}"`, hintCount: state.hintCount };
  }
}



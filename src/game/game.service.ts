import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { Redis } from '@upstash/redis';
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

  // 게임 시작: 초기 AI 단어를 생성하고 게임 상태를 저장
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
      await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
      return state;
    } catch (e) {
      throw new InternalServerErrorException('Could not start game');
    }
  }

  // 게임 상태 조회
  async getGameState(sessionId: string): Promise<GameState> {
    const data = await this.redis.get<string>(this.key(sessionId));
    if (!data) {
      throw new BadRequestException('No game found for session');
    }
    return JSON.parse(data);
  }

  // 사용자의 답변 검증 및 새 라운드 진행
  async verifyAnswer(sessionId: string, answer: string) {
    const state = await this.getGameState(sessionId);
    const lastLetter = state.currentWord.slice(-1).toLowerCase();
    const clean = answer.trim().toLowerCase();

    if (!clean) {
      return { correct: false, message: 'Invalid word.', score: state.score, streak: state.streak };
    }
    if (clean[0] !== lastLetter) {
      state.streak = 0;
      await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
      return { correct: false, message: `Must start with "${lastLetter}"`, score: state.score, streak: state.streak };
    }

    const nextData: WordChain = await this.wordChainService.getRandomWordWithLetter(clean.slice(-1));
    state.currentWord = nextData.word;
    state.hintCount = 0;
    state.streak++;
    state.score += 10 + Math.min(state.streak * 2, 20);
    await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });

    return {
      correct: true,
      newWord: nextData.word,
      message: `Correct! +${10 + Math.min(state.streak * 2, 20)} points`,
      score: state.score,
      streak: state.streak,
    };
  }

  // 힌트 제공: 가능한 다음 단어들 제안
  async getHint(sessionId: string) {
    const state = await this.getGameState(sessionId);
    if (state.hintCount >= 3) {
      return { hint: 'No hints left', hintCount: state.hintCount };
    }

    const options = await this.wordChainService.getPossibleNextWords(state.currentWord, 3);
    let hintText: string;
    if (options.length === 0) {
      hintText = `Starts with "${state.currentWord.slice(-1)}"`;
    } else if (state.hintCount === 0) {
      hintText = `Starts with "${state.currentWord.slice(-1)}"`;
    } else {
      hintText = options[0].hint;
    }

    state.hintCount++;
    await this.redis.set(this.key(sessionId), JSON.stringify(state), { ex: 3600 });
    return { hint: hintText, hintCount: state.hintCount };
  }
}




// src/chat/chat.service.ts
import {
  Injectable,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SessionService } from '../session/session.service';
import * as crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly genAI: GoogleGenerativeAI;

  constructor(
    private readonly sessionService: SessionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
  }

  private generateCacheKey(message: string): string {
    return `chat:${crypto.createHash('md5').update(message).digest('hex')}`;
  }

  async handleMessage(message: string, sessionId: string): Promise<any> {
    try {
      const userMessage = {
        id: Date.now(),
        text: message,
        sender: 'user',
      };
      await this.sessionService.saveSession(sessionId, userMessage);

      const cacheKey = this.generateCacheKey(message);
      const cachedResponse = await this.cacheManager.get(cacheKey);

      if (cachedResponse) {
        this.logger.log(`Cache hit for: "${message.slice(0, 20)}..."`);
        const botMessage = {
          id: Date.now() + 1,
          text: cachedResponse as string,
          sender: 'bot',
          cached: true,
        };
        await this.sessionService.saveSession(sessionId, botMessage);
        return { response: cachedResponse, pronouncedText: cachedResponse, fromCache: true };
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }); // Gemini 2.5 Pro 사용

      const result = await model.generateContent(message);
      const text = result.response.text();

      await this.cacheManager.set(cacheKey, text, 5 * 60 * 1000); // 5 minutes
      const botMessage = {
        id: Date.now() + 1,
        text,
        sender: 'bot',
      };
      await this.sessionService.saveSession(sessionId, botMessage);

      return { response: text, pronouncedText: text };
    } catch (error) {
      this.logger.error('Gemini API failed:', error);
      const fallback = "I'm having trouble responding right now. Please try again later.";
      await this.sessionService.saveSession(sessionId, {
        id: Date.now() + 1,
        text: fallback,
        sender: 'bot',
        error: true,
      });
      throw new InternalServerErrorException('Failed to process message');
    }
  }
}

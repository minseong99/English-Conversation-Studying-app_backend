// src/chat/chat.service.ts
import { Injectable, InternalServerErrorException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SessionService } from '../session/session.service';
import * as crypto from 'crypto';
import { catchError, delay, retry } from 'rxjs/operators';
import { from, throwError } from 'rxjs';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // Base delay 1s with exponential backoff
  private genAI: GoogleGenerativeAI;
  private geminiModel: any; // Using 'any' because the SDK's TypeScript definitions might not be complete
  
  constructor(
    private readonly sessionService: SessionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    // Initialize Google Gemini API client
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /**
   * Generate a cache key for chat messages
   */
  private generateCacheKey(message: string): string {
    // Create a hash of the message for cache key
    return `chat:${crypto
      .createHash('md5')
      .update(message)
      .digest('hex')}`;
  }

  /**
   * Handle user message with error handling, caching, and retry mechanisms
   */
  async handleMessage(message: string, sessionId: string): Promise<any> {
    try {
      // 1. Save user message to session
      const userMessage = {
        id: Date.now(),
        text: message,
        sender: 'user',
      };
      await this.sessionService.saveSession(sessionId, userMessage);

      // 2. Check cache first
      const cacheKey = this.generateCacheKey(message);
      const cachedResponse = await this.cacheManager.get(cacheKey);
      
      if (cachedResponse) {
        this.logger.log(`Cache hit for message: "${message.substring(0, 20)}..."`);
        
        // Save cached bot response to session
        const botMessage = {
          id: Date.now() + 1,
          text: cachedResponse as string,
          sender: 'bot',
          cached: true,
        };
        await this.sessionService.saveSession(sessionId, botMessage);
        
        return {
          response: cachedResponse,
          pronouncedText: cachedResponse,
          fromCache: true
        };
      }

      // 3. Call Google Gemini API with retry mechanism using RxJS
      const chatResponse = await from(
        this.callGeminiAPI(message)
      )
      .pipe(
        retry({
          count: this.maxRetries,
          delay: (error, retryCount) => {
            // Exponential backoff
            const waitTime = Math.pow(2, retryCount) * this.retryDelay;
            this.logger.warn(`Retrying API call (${retryCount}/${this.maxRetries}) after ${waitTime}ms`);
            return throwError(() => error).pipe(delay(waitTime));
          }
        }),
        catchError((error) => {
          if (error.status === 429) {
            throw new HttpException(
              'Google Gemini API rate limit exceeded. Please try again later.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          this.logger.error(`Failed to call Gemini API after ${this.maxRetries} retries:`, error);
          throw new InternalServerErrorException('Chat processing failed after multiple attempts.');
        })
      ).toPromise();

      // 4. Cache the successful response (5 minutes TTL)
      await this.cacheManager.set(cacheKey, chatResponse, 5 * 60 * 1000);
      
      // 5. Save bot response to session
      const botMessage = {
        id: Date.now() + 1,
        text: chatResponse,
        sender: 'bot',
      };
      await this.sessionService.saveSession(sessionId, botMessage);

      return { response: chatResponse, pronouncedText: chatResponse };
    } catch (error: any) {
      this.logger.error('ChatService.handleMessage error:', error);
      
      // Return a fallback response for the user in case of errors
      const fallbackResponse = "I'm having trouble responding right now. Please try again in a moment.";
      
      // Save fallback response to session
      const errorMessage = {
        id: Date.now() + 1,
        text: fallbackResponse,
        sender: 'bot',
        error: true,
      };
      await this.sessionService.saveSession(sessionId, errorMessage);
      
      if (error.status === 429) {
        throw new HttpException(
          'Google Gemini API request limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      
      throw new InternalServerErrorException('Chat processing encountered an issue.');
    }
  }

  /**
   * Protected method to call Google Gemini API with proper handling
   */
  private async callGeminiAPI(message: string): Promise<string> {
    try {
      this.logger.log(`Calling Google Gemini API for message: "${message.substring(0, 20)}..."`);
      
      // For Gemini, we get chat history for the conversation if needed
      // This is just a simple implementation - you might want to expand this
      const result = await this.geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      });

      const response = result.response;
      
      // Extract text from the response
      const responseText = response.text();
      
      if (!responseText) {
        this.logger.warn('Empty response from Gemini API');
        return 'I apologize, but I couldn\'t generate a response.';
      }

      return responseText;
    } catch (error) {
      this.logger.error(`Gemini API error:`, error);
      throw error;
    }
  }
}
// src/chat/chat.service.ts
import { Injectable, InternalServerErrorException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import { SessionService } from '../session/session.service';
import * as crypto from 'crypto';
import { catchError, delay, retry } from 'rxjs/operators';
import { from, throwError } from 'rxjs';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // Base delay 1s with exponential backoff
  
  constructor(
    private readonly sessionService: SessionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

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

      // 3. Call Hugging Face API with retry mechanism using RxJS
      const apiUrl = 'https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill';
      const headers = { Authorization: `Bearer ${process.env.HF_API_KEY}` };
      
      const chatResponse = await from(
        this.callHuggingFaceAPI(apiUrl, message, headers)
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
          if (error.response && error.response.status === 429) {
            throw new HttpException(
              'Hugging Face API rate limit exceeded. Please try again later.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          this.logger.error(`Failed to call Hugging Face API after ${this.maxRetries} retries:`, error);
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
      
      if (error.response && error.response.status === 429) {
        throw new HttpException(
          'Hugging Face API request limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      
      throw new InternalServerErrorException('Chat processing encountered an issue.');
    }
  }

  /**
   * Protected method to call Hugging Face API with proper handling
   */
  private async callHuggingFaceAPI(url: string, message: string, headers: any): Promise<string> {
    try {
      this.logger.log(`Calling Hugging Face API for message: "${message.substring(0, 20)}..."`);
      
      const response = await axios.post(
        url,
        { inputs: message },
        { headers }
      );

      // Check for valid response structure
      if (!response.data || !Array.isArray(response.data)) {
        this.logger.warn('Unexpected API response format:', response.data);
        throw new Error('Invalid API response format');
      }

      // Extract response text or use default
      return response.data[0]?.generated_text || 'I apologize, but I couldn\'t generate a response.';
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(`Hugging Face API error status: ${status}`, JSON.stringify(data));
      throw error;
    }
  }
}
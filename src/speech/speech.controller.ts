// src/speech/speech.controller.ts
import { Controller, Post, Body, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import { Buffer } from 'buffer';
import { promisify } from 'util';
import * as crypto from 'crypto';

const execFileAsync = promisify(require('child_process').execFile);

if (!global.Buffer) global.Buffer = Buffer;

@Controller('api/speech')
export class SpeechController {
  private readonly logger = new Logger(SpeechController.name);
  
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Generate cache key for STT requests
   */
  private generateSTTCacheKey(audio: string): string {
    // Create hash of first 20KB of audio (to avoid excessive computation)
    return `stt:${crypto
      .createHash('md5')
      .update(audio.substring(0, 20000))
      .digest('hex')}`;
  }

  /**
   * Generate cache key for TTS requests
   */
  private generateTTSCacheKey(text: string, speaker?: string): string {
    return `tts:${crypto
      .createHash('md5')
      .update(`${text}|${speaker || 'default'}`)
      .digest('hex')}`;
  }

  /**
   * STT Endpoint using Hugging Face's wav2vec2-large-xlsr-53-english model
   * POST /api/speech/stt
   * 입력: JSON { "audio": "<base64-encoded-audio>" }
   * 처리: 음성을 텍스트로 변환하여 반환
   */
  @Post('stt')
  async speechToText(@Body() body: { audio: string }): Promise<any> {
    if (!body.audio || body.audio.trim() === '') {
      throw new HttpException('No audio provided', HttpStatus.BAD_REQUEST);
    }
    
    // base64로 인코딩된 오디오 데이터를 Buffer로 디코딩
    const audioBuffer = Buffer.from(body.audio, 'base64');
    if (audioBuffer.length === 0) {
      throw new HttpException('Empty audio data', HttpStatus.BAD_REQUEST);
    }
    
    // Check cache first (except for very large audio files)
    if (body.audio.length < 500000) { // Skip caching for very large audios
      const cacheKey = this.generateSTTCacheKey(body.audio);
      const cachedResult = await this.cacheManager.get(cacheKey);
      
      if (cachedResult) {
        this.logger.log('STT cache hit');
        return { text: cachedResult as string, fromCache: true };
      }
    }
    
    const url = 'https://api-inference.huggingface.co/models/jonatasgrosman/wav2vec2-large-xlsr-53-english';
    const headers = {
      Authorization: `Bearer ${process.env.HF_API_KEY}`,
      'Content-Type': 'application/octet-stream'
    };
  
    const maxAttempts = 5;
    let attempt = 0;
    let delay = 1000; // 초기 딜레이: 1초
    let lastError: any = null;
  
    while (attempt < maxAttempts) {
      try {
        const response = await axios.post(url, audioBuffer, {
          headers,
          timeout: 15000,
        });
        
        // Process successful response
        const resultText = response.data.text || '';
        
        // Cache result for future use (only cache smaller audios)
        if (body.audio.length < 500000) {
          const cacheKey = this.generateSTTCacheKey(body.audio);
          await this.cacheManager.set(cacheKey, resultText, 60 * 60 * 1000); // 1 hour TTL
          this.logger.log('STT result cached');
        }
        
        // 성공 시 결과 반환
        return { text: resultText };
      } catch (error: any) {
        lastError = error;
        
        // Intelligent retry logic
        if (error.response) {
          const status = error.response.status;
          
          // For rate limiting or service unavailable, retry with backoff
          if (status === 503 || status === 429) {
            attempt++;
            this.logger.warn(`STT attempt ${attempt} failed with ${status}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // 지수적으로 딜레이 증가
            continue;
          }
          
          // For other HTTP errors, don't retry
          this.logger.error(`STT error with status ${status}:`, error.response.data);
          throw new HttpException(
            `STT service error: ${error.response.data?.error || 'Unknown error'}`, 
            status
          );
        }
        
        // For network errors, retry up to limit
        attempt++;
        this.logger.warn(`STT network error (attempt ${attempt}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    
    // Log details about the failed request
    this.logger.error('STT failed after max retries:', lastError);
    
    // Return a more specific error based on the last error
    if (lastError?.response?.status === 429) {
      throw new HttpException(
        'Speech recognition service is currently overloaded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    
    throw new HttpException(
      'Speech recognition failed after multiple attempts. Please try again later.',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  /**
   * TTS Endpoint using Flask TTS Service
   * POST /api/speech/tts
   * 입력: JSON { "text": "합성할 텍스트", "speaker": "화자ID (선택)" }
   * 처리: Flask TTS 서비스를 호출하여 TTS 모델을 이용해 텍스트를 해당 화자로 음성 합성
   * 출력: JSON { "audio": "<base64-encoded-audio>" }
   */
  @Post('tts')
  async textToSpeech(@Body() body: { text: string, speaker?: string }): Promise<any> {
    try {
      // Validate input
      if (!body.text || body.text.trim() === '') {
        throw new HttpException('No text provided', HttpStatus.BAD_REQUEST);
      }
      
      // Check cache first
      const cacheKey = this.generateTTSCacheKey(body.text, body.speaker);
      const cachedAudio = await this.cacheManager.get(cacheKey);
      
      if (cachedAudio) {
        this.logger.log('TTS cache hit');
        return { audio: cachedAudio, fromCache: true };
      }
      
      // Prepare Flask TTS service URL
      const flaskUrl = `http://${process.env.FLASK_IP || 'localhost'}:5000/api/tts`;
      
      // Initialize retry variables
      const maxRetries = 3;
      let retryCount = 0;
      let lastError: any = null;
      
      // TTS API call with retry
      while (retryCount <= maxRetries) {
        try {
          const response = await axios.post(
            flaskUrl,
            {
              text: body.text,
              speaker: body.speaker, // 선택적 화자 옵션
            },
            { 
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000 // 10s timeout
            }
          );
          
          // Cache successful response
          if (response.data && response.data.audio) {
            await this.cacheManager.set(
              cacheKey, 
              response.data.audio, 
              30 * 60 * 1000 // 30 minutes TTL
            );
            this.logger.log('TTS result cached');
          }
          
          return response.data; // { audio: "base64string" }
        } catch (error: any) {
          lastError = error;
          
          // Check if we should retry
          if (
            retryCount < maxRetries && 
            (!error.response || error.response.status >= 500 || error.response.status === 429)
          ) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            this.logger.warn(`TTS retry ${retryCount}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // Don't retry client errors or after max retries
            break;
          }
        }
      }
      
      // Handle errors after retries
      this.logger.error('TTS failed after retries:', lastError);
      
      if (lastError?.response?.status === 429) {
        throw new HttpException(
          'TTS service is currently rate limited. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      
      throw new HttpException(
        'Failed to synthesize speech. TTS service may be unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error; // Re-throw existing HTTP exceptions
      }
      
      this.logger.error('TTS Error:', error);
      throw new HttpException(
        'Failed to process text-to-speech request',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}


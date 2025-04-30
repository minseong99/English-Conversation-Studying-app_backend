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
   * 처리: api 처리 
   * 출력: JSON { "audio": "<base64-encoded-audio>" }
   */
  @Post('tts')
  async textToSpeech(@Body() body: { text: string, speaker?: string }): Promise<any> {
    // 1) 입력 검증
    if (!body.text || body.text.trim() === '') {
      throw new HttpException('No text provided', HttpStatus.BAD_REQUEST);
    }

    // 2) 캐시 확인
    const cacheKey = this.generateTTSCacheKey(body.text, body.speaker);
    const cachedAudio = await this.cacheManager.get<string>(cacheKey);
    if (cachedAudio) {
      this.logger.log('TTS cache hit');
      return { audio: cachedAudio, fromCache: true };
    }

    // 3) HF Inference API URL & Token (모델을 en/vctk/vits로 고정)
    const hfUrl = 'https://api-inference.huggingface.co/models/espnet/kan-bayashi_ljspeech_vits';
    const hfToken = process.env.HF_API_KEY;
    if (!hfToken) {
      this.logger.error('HF_TOKEN is not set');
      throw new HttpException('TTS service not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // 4) 호출 및 재시도 로직
    const maxRetries = 3;
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          hfUrl,
          {
            inputs: body.text,
            // 공식 en/vctk/vits 모델은 'speaker' 파라미터를 지원합니다
            parameters: body.speaker ? { speaker: body.speaker } : {},
          },
          {
            headers: {
              Authorization: `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
            timeout: 60000,
          },
        );

        // 5) 바이너리 → Base64 인코딩
        const audioBase64 = Buffer.from(response.data, 'binary').toString('base64');

        // 6) 캐시에 저장 (30분)
        await this.cacheManager.set(cacheKey, audioBase64, );
        this.logger.log(`TTS via HF (en/vctk/vits) success on attempt ${attempt + 1}`);

        return { audio: audioBase64 };
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;

        // 서버 에러(5xx) 혹은 rate-limit(429)일 때만 재시도
        if (attempt < maxRetries && (!status || status >= 500 || status === 429)) {
          const delay = Math.pow(2, attempt + 1) * 1000;
          this.logger.warn(`HF TTS retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        break;
      }
    }

    // 7) 실패 처리
    this.logger.error('TTS failed after retries:', {
      status: lastError?.response?.status,
      message: lastError?.message,
    });
    if (lastError?.response?.status === 429) {
      throw new HttpException(
        'TTS rate limit exceeded, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new HttpException(
      'Failed to synthesize via Hugging Face',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

}


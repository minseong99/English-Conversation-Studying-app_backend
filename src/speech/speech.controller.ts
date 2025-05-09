// src/speech/speech.controller.ts
import { Controller, Post, Body, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import { Buffer } from 'buffer';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { TextToSpeechClient, protos as ttsProtos } from '@google-cloud/text-to-speech';
import { SpeechClient, protos as sttProtos } from '@google-cloud/speech';

const execFileAsync = promisify(require('child_process').execFile);

if (!global.Buffer) global.Buffer = Buffer;

@Controller('api/speech')
export class SpeechController {
  private readonly logger = new Logger(SpeechController.name);
  private ttsClient: TextToSpeechClient;
  private sttClient: SpeechClient;
  
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    // Initialize Google Cloud clients
    this.ttsClient = new TextToSpeechClient();
    this.sttClient = new SpeechClient();
  }

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
   * STT Endpoint using Google Speech-to-Text API
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
    
    const maxAttempts = 5;
    let attempt = 0;
    let delay = 1000; // 초기 딜레이: 1초
    let lastError: any = null;
  
    while (attempt < maxAttempts) {
      try {
        // Configure request for Google Speech-to-Text
        const request: sttProtos.google.cloud.speech.v1.IRecognizeRequest = {
          audio: {
            content: body.audio, // Already base64 encoded
          },
          config: {
            encoding: sttProtos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
            sampleRateHertz: 16000,
            languageCode: 'en-US',
          },
        };
        
        // Make request to Google Speech-to-Text
        const [response] = await this.sttClient.recognize(request);
        
        // Extract transcription
        const resultText = response.results
          .map(result => result.alternatives[0].transcript)
          .join(' ');
        
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
        if (error.code) {
          // For rate limiting or service unavailable, retry with backoff
          if (error.code === 8 || error.code === 14 || error.code === 4) {
            attempt++;
            this.logger.warn(`STT attempt ${attempt} failed with code ${error.code}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // 지수적으로 딜레이 증가
            continue;
          }
          
          // For other errors, don't retry
          this.logger.error(`STT error with code ${error.code}:`, error.details || error.message);
          throw new HttpException(
            `STT service error: ${error.details || error.message || 'Unknown error'}`, 
            HttpStatus.BAD_REQUEST
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
    if (lastError?.code === 8) {
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
   * TTS Endpoint using Google Text-to-Speech API
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

    // 3) 호출 및 재시도 로직
    const maxRetries = 3;
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Configure voice based on speaker parameter
        let voice: ttsProtos.google.cloud.texttospeech.v1.IVoiceSelectionParams = {
          languageCode: 'en-US',
          name: 'en-US-Neural2-F', // Default female voice
        };
        
        // Map speaker parameter to Google voice names
        if (body.speaker) {
          // Simple mapping example - extend as needed
          const voiceMap = {
            'male': 'en-US-Neural2-D',
            'female': 'en-US-Neural2-F',
            'male2': 'en-US-Neural2-J',
            'female2': 'en-US-Neural2-E',
          };
          
          if (voiceMap[body.speaker]) {
            voice.name = voiceMap[body.speaker];
          }
        }
        
        // Configure request
        const request: ttsProtos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
          input: { text: body.text },
          voice: voice,
          audioConfig: { audioEncoding: ttsProtos.google.cloud.texttospeech.v1.AudioEncoding.MP3 },
        };

        // Make the request
        const [response] = await this.ttsClient.synthesizeSpeech(request);
        
        // Convert audio content to base64
        const audioBase64 = Buffer.from(response.audioContent).toString('base64');

        // 6) 캐시에 저장 (30분)
        await this.cacheManager.set(cacheKey, audioBase64, 30 * 60 * 1000);
        this.logger.log(`TTS via Google TTS success on attempt ${attempt + 1}`);

        return { audio: audioBase64 };
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = error.code === 8 || error.code === 14 || error.code === 4;
        
        if (attempt < maxRetries && isRetryable) {
          const delay = Math.pow(2, attempt + 1) * 1000;
          this.logger.warn(`Google TTS retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        break;
      }
    }

    // 7) 실패 처리
    this.logger.error('TTS failed after retries:', {
      code: lastError?.code,
      message: lastError?.message,
    });
    if (lastError?.code === 8) {
      throw new HttpException(
        'TTS rate limit exceeded, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new HttpException(
      'Failed to synthesize speech',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

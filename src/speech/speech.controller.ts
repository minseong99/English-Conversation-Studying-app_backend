// src/speech/speech.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';
import { SpeechClient } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

@Controller('api/speech')
export class SpeechController {
  private readonly logger = new Logger(SpeechController.name);
  private readonly sttClient = new SpeechClient();
  private readonly ttsClient = new TextToSpeechClient();

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  // ✅ STT 캐시 키 생성
  private generateSTTCacheKey(audio: string): string {
    return `stt:${crypto.createHash('md5').update(audio.substring(0, 20000)).digest('hex')}`;
  }

  // ✅ TTS 캐시 키 생성
  private generateTTSCacheKey(text: string, speaker?: string): string {
    return `tts:${crypto.createHash('md5').update(`${text}|${speaker || 'default'}`).digest('hex')}`;
  }

  // ==========================
  // 🗣️ STT: Speech to Text
  // ==========================
  @Post('stt')
  async speechToText(@Body() body: { audio: string }): Promise<any> {
    if (!body.audio || body.audio.trim() === '') {
      throw new HttpException('No audio provided', HttpStatus.BAD_REQUEST);
    }

    const audioBuffer = Buffer.from(body.audio, 'base64');
    if (audioBuffer.length === 0) {
      throw new HttpException('Empty audio data', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`📏 base64 length: ${body.audio.length}`);
    this.logger.log(`📦 base64 preview: ${body.audio.substring(0, 100)}...`);

    // Check audio format by examining first few bytes
    const audioFormat = this.detectAudioFormat(body.audio);
    this.logger.log(`🔍 Detected audio format: ${audioFormat}`);

    if (body.audio.length < 500000) {
      const cacheKey = this.generateSTTCacheKey(body.audio);
      const cachedResult = await this.cacheManager.get(cacheKey);
      if (cachedResult) {
        this.logger.log('STT cache hit');
        return { text: cachedResult as string, fromCache: true };
      }
    }

    try {
      const [response] = await this.sttClient.recognize({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          // Add alternative language code for better recognition
          alternativeLanguageCodes: ['ko-KR'],
          // Increase model complexity for better results
          model: 'latest_long',
        },
        audio: { content: body.audio },
      });

      const transcription = response.results
        ?.map(result => result.alternatives?.[0]?.transcript)
        .join(' ')
        .trim();

      // Instead of throwing an exception, return an empty string or a placeholder
      if (!transcription) {
        this.logger.warn('No transcription result returned from Google STT');
        return { text: "", noSpeechDetected: true };
      }

      if (body.audio.length < 500000) {
        const cacheKey = this.generateSTTCacheKey(body.audio);
        await this.cacheManager.set(cacheKey, transcription, 60 * 60 * 1000);
        this.logger.log('STT result cached');
      }

      return { text: transcription };
    } catch (error: any) {
      this.logger.error('Google STT failed:', {
        message: error.message,
        code: error.code,
        details: error.details,
        metadata: error.metadata,
      });

      // Return a more helpful error message with suggestions
      throw new HttpException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Failed to transcribe audio',
        message: 'Speech recognition service is currently unavailable. Please try again later or check your audio format.',
        details: error.message
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  // Helper method to detect audio format from base64 string
  private detectAudioFormat(base64Audio: string): string {
    const audioPreview = base64Audio.substring(0, 100);
    
    if (audioPreview.startsWith('AAAAGGZ0')) {
      return '3GP format detected';
    } else if (audioPreview.startsWith('UklGR')) {
      return 'WAV format detected';
    } else if (audioPreview.startsWith('SUQz')) {
      return 'MP3 format detected';
    } else if (audioPreview.startsWith('T2dnU')) {
      return 'OPUS format detected';
    } else {
      return 'Unknown format';
    }
  }

  // ==========================
  // 🔊 TTS: Text to Speech
  // ==========================
  @Post('tts')
  async textToSpeech(@Body() body: { text: string; speaker?: string }): Promise<any> {
    if (!body.text || body.text.trim() === '') {
      throw new HttpException('No text provided', HttpStatus.BAD_REQUEST);
    }

    const cacheKey = this.generateTTSCacheKey(body.text, body.speaker);
    const cachedAudio = await this.cacheManager.get<string>(cacheKey);
    if (cachedAudio) {
      this.logger.log('TTS cache hit');
      return { audio: cachedAudio, fromCache: true };
    }

    try {
      const [response] = await this.ttsClient.synthesizeSpeech({
        input: { text: body.text },
        voice: {
          languageCode: 'en-US',
          name: body.speaker || 'en-US-Wavenet-D',
        },
        audioConfig: { audioEncoding: 'MP3' },
      });

      if (!response.audioContent) {
        throw new Error('No audio content returned from TTS service');
      }

      const audioBuffer = Buffer.from(response.audioContent as Uint8Array);
      const audioBase64 = audioBuffer.toString('base64');

      await this.cacheManager.set(cacheKey, audioBase64, 30 * 60 * 1000);
      this.logger.log(`TTS generated with voice: ${body.speaker}`);

      return { audio: audioBase64 };
    } catch (error) {
      this.logger.error('Google TTS failed:', error);
      throw new HttpException('Failed to synthesize speech', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
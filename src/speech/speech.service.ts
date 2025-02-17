// src/speech/speech.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SpeechService {
  async convertSpeechToText(audioData: string): Promise<string> {
    // Google Cloud Speech-to-Text API 연동 구현 예정
    return 'Converted text from speech';
  }

  async convertTextToSpeech(text: string): Promise<string> {
    // Google Cloud Text-to-Speech API 연동 구현 예정
    return 'Audio data (Base64 or URL)';
  }
}

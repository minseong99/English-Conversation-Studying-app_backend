// src/speech/speech.controller.ts
import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { SpeechService } from './speech.service';

@Controller('api/speech')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('stt')
  async speechToText(@Body() body: { audioData: string }) {
    const text = await this.speechService.convertSpeechToText(body.audioData);
    return { text };
  }

  @Get('tts')
  async textToSpeech(@Query('text') text: string) {
    const audio = await this.speechService.convertTextToSpeech(text);
    return { audio };
  }
}

import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller';

@Module({
  controllers: [SpeechController],
})
export class SpeechModule {}

// src/wordchain/wordchain.controller.ts
import { Controller, Get } from '@nestjs/common';
import { WordChainService } from './wordchain.service';

@Controller('api/word')
export class WordChainController {
  constructor(private readonly wordChainService: WordChainService) {}

  @Get('random')
  getRandomWord() {
    return this.wordChainService.getRandomWord();
  }
}

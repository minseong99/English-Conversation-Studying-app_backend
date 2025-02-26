// src/wordchain/wordchain.module.ts
import { Module } from '@nestjs/common';
import { WordChainController } from './wordchain.controller';
import { WordChainService } from './wordchain.service';

@Module({
  controllers: [WordChainController],
  providers: [WordChainService],
  exports: [WordChainService], 
})
export class WordChainModule {}

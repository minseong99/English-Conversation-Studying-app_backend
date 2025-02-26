// src/game/game.module.ts
import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { WordChainModule } from '../wordchain/wordchain.module';

@Module({
  imports: [WordChainModule],
  providers: [GameService],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}

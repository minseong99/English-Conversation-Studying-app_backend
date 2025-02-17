// src/pronunciation/pronunciation.context.ts
import { PronunciationStrategy } from './pronunciation.interface';

export class PronunciationContext {
  constructor(private readonly strategy: PronunciationStrategy) {}

  async execute(text: string): Promise<string> {
    return this.strategy.getPronunciation(text);
  }
}

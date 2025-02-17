// src/pronunciation/default-pronunciation.strategy.ts
import { PronunciationStrategy } from './pronunciation.interface';

export class DefaultPronunciationStrategy implements PronunciationStrategy {
  async getPronunciation(text: string): Promise<string> {
    // 기본 발음: 그대로 반환
    return text;
  }
}

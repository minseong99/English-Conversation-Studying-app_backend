// src/pronunciation/casual-pronunciation.strategy.ts
import { PronunciationStrategy } from './pronunciation.interface';

export class CasualPronunciationStrategy implements PronunciationStrategy {
  async getPronunciation(text: string): Promise<string> {
    // 캐주얼 발음 예시: 간단히 단어 일부 변경
    return text.replace('Response', 'Hey there, response');
  }
}

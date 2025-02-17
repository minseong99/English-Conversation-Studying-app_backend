// src/pronunciation/pronunciation.interface.ts
export interface PronunciationStrategy {
    getPronunciation(text: string): Promise<string>;
  }
  
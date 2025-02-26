// src/wordchain/wordchain.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

export interface WordChain {
  word: string;
  hint: string;
}

@Injectable()
export class WordChainService {
  private randomWordUrl = 'https://random-word-api.herokuapp.com/word?number=10';
  private dictionaryUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en';

  // 기본 랜덤 단어 가져오기 (requiredLetter 없이)
  async getRandomWord(): Promise<WordChain> {
    return this.getRandomWordWithLetter();
  }

  // requiredLetter가 있으면 해당 글자로 시작하는 단어를 필터링
  async getRandomWordWithLetter(requiredLetter?: string): Promise<WordChain> {
    try {
      const response = await axios.get<string[]>(this.randomWordUrl);
      let words = response.data;
      if (requiredLetter) {
        words = words.filter(word => word[0].toLowerCase() === requiredLetter.toLowerCase());
      }
      const word = words.length > 0 ? words[Math.floor(Math.random() * words.length)] : response.data[0];
      
      let hint = 'No hint available.';
      try {
        const defResponse = await axios.get(`${this.dictionaryUrl}/${word}`);
        if (Array.isArray(defResponse.data) &&
            defResponse.data.length > 0 &&
            defResponse.data[0].meanings &&
            defResponse.data[0].meanings.length > 0 &&
            defResponse.data[0].meanings[0].definitions &&
            defResponse.data[0].meanings[0].definitions.length > 0
        ) {
          hint = defResponse.data[0].meanings[0].definitions[0].definition;
        }
      } catch (e) {
        console.error(`Dictionary API error for "${word}":`, e.message);
      }
      
      return { word, hint };
    } catch (error: any) {
      console.error('Error fetching word:', error.message);
      throw new InternalServerErrorException('Error fetching word from free API');
    }
  }
}


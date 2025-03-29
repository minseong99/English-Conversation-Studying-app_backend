// src/wordchain/wordchain.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface WordChain {
  word: string;
  hint: string;
}

interface ToeicWord {
  word: string;
  definition: string;
  level: string;
}

@Injectable()
export class WordChainService {
  private toeicWords: ToeicWord[] = [];
  private readonly dataPath = path.join(process.cwd(), 'src/data/toeic-words.json');

  constructor() {
    this.loadToeicWords();
  }

  private loadToeicWords() {
    try {
      const data = fs.readFileSync(this.dataPath, 'utf8');
      const parsedData = JSON.parse(data);
      this.toeicWords = parsedData.words;
      console.log(`Loaded ${this.toeicWords.length} TOEIC words successfully`);
    } catch (error) {
      console.error('Error loading TOEIC words:', error);
      // Fallback to sample data if file doesn't exist
      this.toeicWords = [
        { word: "business", definition: "The activity of buying and selling goods and services", level: "basic" },
        { word: "employee", definition: "A person who works for a company or organization", level: "basic" },
        { word: "technology", definition: "The application of scientific knowledge for practical purposes", level: "intermediate" },
        { word: "management", definition: "The process of dealing with or controlling things or people", level: "intermediate" },
        { word: "conference", definition: "A formal meeting for discussion", level: "basic" }
      ];
      console.log('Using fallback sample TOEIC words');
    }
  }

  // Get a random TOEIC word (no letter requirement)
  async getRandomWord(): Promise<WordChain> {
    return this.getRandomWordWithLetter();
  }

  // Get a random TOEIC word starting with the required letter
  async getRandomWordWithLetter(requiredLetter?: string): Promise<WordChain> {
    try {
      let filteredWords = this.toeicWords;
      
      if (requiredLetter) {
        filteredWords = this.toeicWords.filter(
          wordData => wordData.word[0].toLowerCase() === requiredLetter.toLowerCase()
        );
      }

      // If no words found with the required letter, return random word
      if (filteredWords.length === 0) {
        const randomIndex = Math.floor(Math.random() * this.toeicWords.length);
        const randomWord = this.toeicWords[randomIndex];
        return {
          word: randomWord.word,
          hint: randomWord.definition
        };
      }

      // Select random word from filtered list
      const randomIndex = Math.floor(Math.random() * filteredWords.length);
      const selectedWord = filteredWords[randomIndex];
      
      return {
        word: selectedWord.word,
        hint: selectedWord.definition
      };
    } catch (error) {
      console.error('Error getting random word:', error);
      throw new InternalServerErrorException('Error retrieving word from TOEIC database');
    }
  }

  // Get possible next words (for enhanced hint functionality)
  async getPossibleNextWords(currentWord: string, count: number = 3): Promise<WordChain[]> {
    try {
      const lastLetter = currentWord.slice(-1).toLowerCase();
      
      // Find words starting with the last letter of current word
      const possibleNextWords = this.toeicWords.filter(
        wordData => wordData.word[0].toLowerCase() === lastLetter
      );

      if (possibleNextWords.length === 0) {
        return [];
      }

      // Shuffle and select requested number of words
      const shuffled = [...possibleNextWords].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Math.min(count, shuffled.length));
      
      return selected.map(word => ({
        word: word.word,
        hint: word.definition
      }));
    } catch (error) {
      console.error('Error getting next word suggestions:', error);
      throw new InternalServerErrorException('Error retrieving word suggestions from TOEIC database');
    }
  }
}


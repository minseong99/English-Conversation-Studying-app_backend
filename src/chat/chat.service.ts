// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SessionService } from '../session/session.service';
import { PronunciationContext } from '../pronunciation/pronunciation.context';
import { DefaultPronunciationStrategy } from '../pronunciation/default-pronunciation.strategy';
import { CasualPronunciationStrategy } from '../pronunciation/casual-pronunciation.strategy';

@Injectable()
export class ChatService {
  private openai: OpenAI;

  constructor(
    private readonly sessionService: SessionService,
  ) {
    // OpenAI 인스턴스 생성 (기본 export인 OpenAI 사용)
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async handleMessage(message: string, strategy: string, sessionId: string): Promise<any> {
    // 1. 사용자 메시지를 세션에 저장 (채팅창에 사용자 메시지로 표시)
    const userMessage = {
      id: Date.now(),
      text: message,
      sender: 'user',
    };
    await this.sessionService.saveSession(sessionId, userMessage);

    // 2. OpenAI API 호출 (최신 openai 패키지 방식 사용)
    const openaiResponse = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
    });
    // 응답에서 텍스트 추출
    const chatResponse = openaiResponse.choices[0].message?.content || 'No response';

    // 3. 선택한 발음 전략에 따라 텍스트 변환
    let strategyImpl;
    if (strategy === 'casual') {
      strategyImpl = new CasualPronunciationStrategy();
    } else {
      strategyImpl = new DefaultPronunciationStrategy();
    }
    const pronunciationContext = new PronunciationContext(strategyImpl);
    const pronouncedText = await pronunciationContext.execute(chatResponse);

    // 4. AI(봇) 메시지를 세션에 저장 (채팅창에 봇 메시지로 표시)
    const botMessage = {
      id: Date.now() + 1,
      text: pronouncedText,
      sender: 'bot',
    };
    await this.sessionService.saveSession(sessionId, botMessage);

    return { response: chatResponse, pronouncedText };
  }
}


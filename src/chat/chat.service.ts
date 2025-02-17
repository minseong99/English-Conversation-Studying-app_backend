// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { PronunciationContext } from '../pronunciation/pronunciation.context';
import { DefaultPronunciationStrategy } from '../pronunciation/default-pronunciation.strategy';
import { CasualPronunciationStrategy } from '../pronunciation/casual-pronunciation.strategy';
import { Configuration, OpenAIApi } from 'openai';
import { SessionService } from '../session/session.service';

@Injectable()
export class ChatService {
  private openai: OpenAIApi;

  constructor(
    private readonly sessionService: SessionService,
  ) {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);
  }

  async handleMessage(message: string, strategy: string, sessionId: string): Promise<any> {
    // 1. 사용자 메시지를 세션에 저장 (채팅창에서 사용자 메시지로 표시)
    const userMessage = {
      id: Date.now(),
      text: message,
      sender: 'user',
    };
    await this.sessionService.saveSession(sessionId, userMessage);

    // 2. ChatGPT API 호출 (실제 OpenAI API 사용)
    const openaiResponse = await this.openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
    });
    const chatResponse = openaiResponse.data.choices[0].message?.content || 'No response';

    // 3. 선택한 발음 전략 적용
    let strategyImpl;
    if (strategy === 'casual') {
      strategyImpl = new CasualPronunciationStrategy();
    } else {
      strategyImpl = new DefaultPronunciationStrategy();
    }
    const pronunciationContext = new PronunciationContext(strategyImpl);
    const pronouncedText = await pronunciationContext.execute(chatResponse);

    // 4. AI(봇) 메시지를 세션에 저장 (채팅창에서 봇 메시지로 표시)
    const botMessage = {
      id: Date.now() + 1,
      text: pronouncedText,
      sender: 'bot',
    };
    await this.sessionService.saveSession(sessionId, botMessage);

    return { response: chatResponse, pronouncedText };
  }
}


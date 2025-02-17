// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { PronunciationContext } from '../pronunciation/pronunciation.context';
import { DefaultPronunciationStrategy } from '../pronunciation/default-pronunciation.strategy';
import { CasualPronunciationStrategy } from '../pronunciation/casual-pronunciation.strategy';
// import { SessionService } from '../session/session.service';

@Injectable()
export class ChatService {
  // 생성자에 SessionService 주입 (세션 저장에 활용)
  // constructor(private readonly sessionService: SessionService) {}

  async handleMessage(message: string, strategy: string, sessionId: string): Promise<any> {
    // ChatGPT API 호출 (여기서는 모의 응답 사용)
    let chatResponse = `Response to: ${message}`;

    // 발음 전략 선택
    let strategyImpl;
    if (strategy === 'casual') {
      strategyImpl = new CasualPronunciationStrategy();
    } else {
      strategyImpl = new DefaultPronunciationStrategy();
    }
    const pronunciationContext = new PronunciationContext(strategyImpl);
    const pronouncedText = await pronunciationContext.execute(chatResponse);

    // (옵션) 세션 저장 (예: Redis를 통한 임시 저장)
//    await this.sessionService.saveSession(sessionId, { message, chatResponse });

    return { response: chatResponse, pronouncedText };
  }
}

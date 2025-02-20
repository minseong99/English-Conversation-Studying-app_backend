// src/chat/chat.service.ts
import { Injectable, InternalServerErrorException, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { SessionService } from '../session/session.service';


@Injectable()
export class ChatService {
  constructor(
    private readonly sessionService: SessionService,
  ) {}

  async handleMessage(message: string, sessionId: string): Promise<any> {
    try {
      // 1. 사용자 메시지를 세션에 저장 (채팅창에 사용자 메시지로 표시)
      const userMessage = {
        id: Date.now(),
        text: message,
        sender: 'user',
      };
      await this.sessionService.saveSession(sessionId, userMessage);

      // 2. Hugging Face API 호출 (facebook/blenderbot-400M-distill 모델 사용)
      const hfResponse = await axios.post(
        'https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill',
        { inputs: message },
        {
          headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, // HF API 토큰 필요 (없으면 해당 헤더 제거)
        },
      );

      // 응답에서 텍스트 추출
      const chatResponse = hfResponse.data[0]?.generated_text || 'No response';

     // 3. 기본 발음 사용 (발음 전략 제거)
     const pronouncedText = chatResponse; // 그냥 그대로 사용

      // 4. AI(봇) 메시지를 세션에 저장 (채팅창에 봇 메시지로 표시)
      const botMessage = {
        id: Date.now() + 1,
        text: pronouncedText,
        sender: 'bot',
      };
      await this.sessionService.saveSession(sessionId, botMessage);

      return { response: chatResponse, pronouncedText };
    } catch (error: any) {
      console.error('ChatService.handleMessage error:', error);
      if (error.response && error.response.status === 429) {
        throw new HttpException(
          'Hugging Face API 요청 한도를 초과했습니다.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new InternalServerErrorException('Chat 처리 중 문제가 발생했습니다.');
    }
  }
}



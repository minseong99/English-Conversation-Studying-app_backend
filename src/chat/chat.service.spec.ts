// src/chat/chat.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { DefaultPronunciationStrategy } from '../pronunciation/default-pronunciation.strategy';
import { CasualPronunciationStrategy } from '../pronunciation/casual-pronunciation.strategy';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatService],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle message with default strategy', async () => {
    const result = await service.handleMessage('Test message', 'default', 'session-test');
    expect(result.response).toContain('Response to: Test message');
    expect(result.pronouncedText).toEqual(result.response);
  });

  it('should handle message with casual strategy', async () => {
    const result = await service.handleMessage('Test message', 'casual', 'session-test');
    expect(result.response).toContain('Response to: Test message');
    // casual 전략은 'Response' 단어를 변환하므로 결과가 달라야 함
    expect(result.pronouncedText).not.toEqual(result.response);
    expect(result.pronouncedText).toContain('Hey there, response');
  });
});

// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { SessionService } from '../src/session/session.service';

// 테스트 환경에서는 SessionService를 모킹합니다 (옵션).
class MockSessionService {
  async saveSession(sessionId: string, data: any) { /* no-op */ }
  async getSession(sessionId: string) { return null; }
  async deleteSession(sessionId: string) { /* no-op */ }
}

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 테스트 시 SessionService를 모킹하여 Redis 연결 문제 회피
      .overrideProvider(SessionService)
      .useClass(MockSessionService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/chat (POST) - default strategy', () => {
    return request(app.getHttpServer())
      .post('/api/chat')
      .send({ message: 'Hello', strategy: 'default', sessionId: 'e2e-session' })
      .expect(201) // 변경: 200에서 201로 수정
      .expect((res) => {
        expect(res.body.response).toContain('Response to: Hello');
        expect(res.body.pronouncedText).toEqual(res.body.response);
      });
  });

  it('/api/chat (POST) - casual strategy', () => {
    return request(app.getHttpServer())
      .post('/api/chat')
      .send({ message: 'Hello', strategy: 'casual', sessionId: 'e2e-session' })
      .expect(201) // 변경: 200에서 201로 수정
      .expect((res) => {
        expect(res.body.response).toContain('Response to: Hello');
        expect(res.body.pronouncedText).toContain('Hey there, response');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});



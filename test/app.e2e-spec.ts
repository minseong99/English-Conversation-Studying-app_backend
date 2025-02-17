// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/chat (POST) - default strategy', () => {
    return request(app.getHttpServer())
      .post('/api/chat')
      .send({ message: 'Hello', strategy: 'default', sessionId: 'e2e-session' })
      .expect(200)
      .expect((res) => {
        expect(res.body.response).toContain('Response to: Hello');
        expect(res.body.pronouncedText).toEqual(res.body.response);
      });
  });

  it('/api/chat (POST) - casual strategy', () => {
    return request(app.getHttpServer())
      .post('/api/chat')
      .send({ message: 'Hello', strategy: 'casual', sessionId: 'e2e-session' })
      .expect(200)
      .expect((res) => {
        expect(res.body.response).toContain('Response to: Hello');
        expect(res.body.pronouncedText).toContain('Hey there, response');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});


import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import { environmentConfig } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.use(helmet()); // 기본 보안 헤더 추가
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'DELETE'],
  });

  // JSON 본문 크기 제한 및 보안 강화
  app.use(bodyParser.json({ 
    limit: '10mb',
    strict: true 
  }));
  app.use(bodyParser.urlencoded({ 
    limit: '10mb', 
    extended: true 
  }));

  const configService = app.get(ConfigService);
  const port = configService.get('PORT', 3000);

  await app.listen(port, () => {
    console.log(`Application running on port ${port}`);
  });
}

bootstrap().catch(console.error);

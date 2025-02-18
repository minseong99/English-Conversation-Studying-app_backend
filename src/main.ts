import * as dotenv from 'dotenv';
dotenv.config();


import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // JSON 본문 크기 제한을 10MB로 증가 (필요에 따라 조정)
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // await app.listen(3000);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

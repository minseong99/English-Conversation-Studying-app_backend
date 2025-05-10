import * as dotenv from 'dotenv';
dotenv.config(); // ① .env 먼저 로딩

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as cluster from 'cluster';
import * as os from 'os';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('Bootstrap');
const numCPUs = os.cpus().length;

// ✅ ② GCP base64 key 복원 처리
const CREDENTIALS_PATH = path.join(__dirname, '..', 'tmp-google-creds.json');

if (process.env.GOOGLE_CREDENTIALS_B64) {
  try {
    const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, 'base64').toString('utf-8');
    fs.writeFileSync(CREDENTIALS_PATH, decoded);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CREDENTIALS_PATH;
    logger.log('✅ Google credentials restored from base64');
  } catch (err) {
    logger.error('❌ Failed to decode GOOGLE_CREDENTIALS_B64:', err);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application is running on port ${port}`);
}

if (process.env.NODE_ENV === 'production') {
  const clusterAny: any = cluster;
  if (clusterAny.isPrimary) {
    logger.log(`Primary server started on ${process.pid}`);
    const workerCount = process.env.WORKER_COUNT ?
      parseInt(process.env.WORKER_COUNT) :
      Math.min(numCPUs, 4);

    logger.log(`Starting ${workerCount} workers...`);

    for (let i = 0; i < workerCount; i++) {
      clusterAny.fork();
    }

    clusterAny.on('exit', (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`);
      logger.log('Starting a new worker...');
      clusterAny.fork();
    });
  } else {
    bootstrap().catch(err => {
      logger.error(`Error during bootstrap: ${err}`);
      process.exit(1);
    });
  }
} else {
  bootstrap().catch(err => {
    logger.error(`Error during bootstrap: ${err}`);
    process.exit(1);
  });
}


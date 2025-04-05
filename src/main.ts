// src/main.ts
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as cluster from 'cluster';
import * as os from 'os';
import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');
const numCPUs = os.cpus().length;

async function bootstrap() {
  // Create NestJS application
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // JSON body size limit increased to 10MB
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Get port from environment or use default
  const port = process.env.PORT ?? 3000;
  
  await app.listen(port);
  logger.log(`Application is running on port ${port}`);
}

// Implement cluster mode for production
if (process.env.NODE_ENV === 'production') {
  const clusterAny: any = cluster;
  if (clusterAny.isPrimary) {
    logger.log(`Primary server started on ${process.pid}`);
    
    // Fork workers based on CPU cores
    const workerCount = process.env.WORKER_COUNT ? 
      parseInt(process.env.WORKER_COUNT) : 
      Math.min(numCPUs, 4); // Default to max 4 workers or CPU count
    
    logger.log(`Starting ${workerCount} workers...`);
    
    // Fork workers
    for (let i = 0; i < workerCount; i++) {
      clusterAny.fork();
    }
    
    // Handle worker crashes and restart
    clusterAny.on('exit', (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`);
      logger.log('Starting a new worker...');
      clusterAny.fork();
    });
  } else {
    // Workers can share any TCP connection
    bootstrap().catch(err => {
      logger.error(`Error during bootstrap: ${err}`);
      process.exit(1);
    });
  }
} else {
  // Development mode - single process
  bootstrap().catch(err => {
    logger.error(`Error during bootstrap: ${err}`);
    process.exit(1);
  });
}

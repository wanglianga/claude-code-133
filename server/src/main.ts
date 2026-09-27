import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ensureDatabase } from './ensure-db';

async function bootstrap() {
  await ensureDatabase();
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  const port = Number(process.env.PORT || 3001);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[shuttle] API listening on http://0.0.0.0:${port}/api`);
}
bootstrap();

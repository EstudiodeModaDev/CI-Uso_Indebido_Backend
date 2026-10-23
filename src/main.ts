import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { load } from 'js-yaml';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = configService.getOrThrow<number>('app.port');
  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');

  app.setGlobalPrefix(apiPrefix);

  app.use(helmet());

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  /*
   * La especificación se mantiene a mano en src/docs/openapi.yaml
   * y Nest la copia a dist como asset (ver nest-cli.json).
   */
  const openApiDocument = load(
    readFileSync(join(__dirname, 'docs', 'openapi.yaml'), 'utf8'),
  ) as OpenAPIObject;

  SwaggerModule.setup(`${apiPrefix}/docs`, app, openApiDocument);

  await app.listen(port);

  console.log(`API ejecutándose en http://localhost:${port}/${apiPrefix}`);
}

void bootstrap();

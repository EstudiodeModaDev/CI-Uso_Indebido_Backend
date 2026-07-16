import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = configService.getOrThrow<number>("app.port");
  const apiPrefix = configService.getOrThrow<string>("app.apiPrefix");
  const frontendUrl = configService.getOrThrow<string>("app.frontendUrl");

  app.setGlobalPrefix(apiPrefix);

  app.use(helmet());

  app.enableCors({
    origin: frontendUrl,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
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

  await app.listen(port);

  console.log(
    `API ejecutándose en http://localhost:${port}/${apiPrefix}`,
  );
}

void bootstrap();
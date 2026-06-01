import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // グローバルプレフィックス
  app.setGlobalPrefix('api');

  // セキュリティヘッダー
  app.use(helmet());

  // CORS設定
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // バリデーションパイプ（class-validator連携）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 統一レスポンス形式
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger設定
  const config = new DocumentBuilder()
    .setTitle('新・ミライ人間洗濯機 API')
    .setDescription('拠点・筐体・コンテンツ管理および筐体向けAPIの仕様')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  logger.log(`APIサーバー起動: http://localhost:${port}/api`);
  logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
}
bootstrap();

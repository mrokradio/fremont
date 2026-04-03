import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadRuntimeEnvironment } from './common/env';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const runtime = loadRuntimeEnvironment();
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = new Set(runtime.corsAllowedOrigins);
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin is not allowed.'));
    },
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fremont API')
    .setDescription('Financial portfolio management and planning API')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(runtime.port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${runtime.port}`);
}

bootstrap();

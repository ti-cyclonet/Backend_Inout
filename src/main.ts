import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { DataSource } from 'typeorm';
import { Client } from 'pg';

async function bootstrap() {
  // Crear schema manufacturing antes de inicializar la app
  try {
    const client = new Client({
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    
    await client.connect();
    await client.query('CREATE SCHEMA IF NOT EXISTS manufacturing');
    await client.end();
  } catch (error) {
    console.error('Error creando schema manufacturing:', error.message);
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:4201'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  });

  // Aumentar límite de payload para imágenes
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`Backend_Inout corriendo en el puerto ${port}`);

  // Manejo de señales de terminación
  process.on('SIGTERM', async () => {
    console.log('SIGTERM recibido, cerrando servidor...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT recibido, cerrando servidor...');
    await app.close();
    process.exit(0);
  });
}

bootstrap();

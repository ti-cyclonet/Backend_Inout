import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsModule } from './applications/material.module';
import { CommonModule } from './common/common.module';
import { Material } from './applications/entities/material.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: [Material], // Cambia Application por Material
      synchronize: true,
    }),
    MaterialsModule, // Cambia ApplicationsModule por MaterialsModule
    CommonModule
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsModule } from './materials/material.module';
import { MaterialsTModule } from './materials-t/material.t.module';
import { CommonModule } from './common/common.module';
import { Material } from './materials/entities/material.entity';
import { MaterialT } from './materials-t/entities/material-t.entity';
import { AuthModule } from './auth/guards/auth.module';

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
      entities: [Material, MaterialT], 
      synchronize: true,
    }),
    AuthModule,
    MaterialsModule,
    MaterialsTModule, 
    CommonModule
  ],
})
export class AppModule {}

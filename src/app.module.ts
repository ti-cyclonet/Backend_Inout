import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MaterialsModule } from './materials/material.module';
import { MaterialsTModule } from './materials-t/material.t.module';
import { TasksModule } from './tasks/tasks.module';
import { CommonModule } from './common/common.module';
import { Material } from './materials/entities/material.entity';
import { MaterialImage } from './materials/entities/material-image.entity';
import { Activity } from './materials/entities/activity.entity';
import { MaterialT } from './materials-t/entities/material-t.entity';
import { CompositionOne } from './materials-t/entities/material-composition.entity';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: [Material, MaterialImage, Activity, MaterialT, CompositionOne], 
      synchronize: true,
    }),
    AuthModule,
    MaterialsModule,
    MaterialsTModule, 
    TasksModule,
    CommonModule
  ],
})
export class AppModule {}

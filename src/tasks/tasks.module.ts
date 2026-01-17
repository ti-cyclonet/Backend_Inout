import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Activity } from '../materials/entities/activity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Activity])],
  providers: [TasksService],
})
export class TasksModule {}
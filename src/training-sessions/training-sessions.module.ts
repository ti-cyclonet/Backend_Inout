import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingSession } from './entities/training-session.entity';
import { TrainingSessionsService } from './training-sessions.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingSession]),
    UsageCountersModule,
  ],
  controllers: [TrainingSessionsController],
  providers: [TrainingSessionsService],
  exports: [TrainingSessionsService],
})
export class TrainingSessionsModule {}

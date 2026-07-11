import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { UsageCounter } from './entities/usage-counter.entity';
import { UsageCountersService } from './usage-counters.service';
import { LimitEnforcementService } from './limit-enforcement.service';
import { LimitEnforcementGuard } from './guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from './interceptors/usage-warning.interceptor';
import { UsageStatusController } from './usage-status.controller';
import { MonthlyResetCron } from './monthly-reset.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageCounter]),
    HttpModule,
  ],
  controllers: [UsageStatusController],
  providers: [UsageCountersService, LimitEnforcementService, LimitEnforcementGuard, UsageWarningInterceptor, MonthlyResetCron],
  exports: [LimitEnforcementService, LimitEnforcementGuard, UsageWarningInterceptor],
})
export class UsageCountersModule {}

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { UsageCounter } from './entities/usage-counter.entity';
import { UsageCountersService } from './usage-counters.service';
import { LimitEnforcementService } from './limit-enforcement.service';
import { LimitEnforcementGuard } from './guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from './interceptors/usage-warning.interceptor';
import { LimitRollbackInterceptor } from './interceptors/limit-rollback.interceptor';
import { UsageStatusController } from './usage-status.controller';
import { MonthlyResetCron } from './monthly-reset.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageCounter]),
    HttpModule,
  ],
  controllers: [UsageStatusController],
  providers: [
    UsageCountersService, LimitEnforcementService, LimitEnforcementGuard, UsageWarningInterceptor, MonthlyResetCron,
    // Global: devuelve el cupo reservado por LimitEnforcementGuard si la operación falla.
    { provide: APP_INTERCEPTOR, useClass: LimitRollbackInterceptor },
  ],
  exports: [LimitEnforcementService, LimitEnforcementGuard, UsageWarningInterceptor],
})
export class UsageCountersModule {}

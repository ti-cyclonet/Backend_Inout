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
import { TrialLockInterceptor } from './interceptors/trial-lock.interceptor';
import { UsageStatusController } from './usage-status.controller';
import { MonthlyResetCron } from './monthly-reset.cron';
import { FeatureGuard } from './guards/feature.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageCounter]),
    HttpModule,
  ],
  controllers: [UsageStatusController],
  providers: [
    UsageCountersService, LimitEnforcementService, LimitEnforcementGuard, FeatureGuard, UsageWarningInterceptor, MonthlyResetCron,
    // Global: devuelve el cupo reservado por LimitEnforcementGuard si la operación falla.
    { provide: APP_INTERCEPTOR, useClass: LimitRollbackInterceptor },
    // Global: prueba vencida sin cambio de plan → no se escribe nada. Va después
    // del anterior para que el cupo reservado se devuelva también en ese caso.
    { provide: APP_INTERCEPTOR, useClass: TrialLockInterceptor },
  ],
  exports: [LimitEnforcementService, LimitEnforcementGuard, FeatureGuard, UsageWarningInterceptor],
})
export class UsageCountersModule {}

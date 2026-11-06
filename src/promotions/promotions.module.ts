import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { PromotionsService } from './promotions.service';
import { PricingService } from './pricing.service';
import { PromotionsController } from './promotions.controller';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';

@Module({
  imports: [UsageCountersModule, TypeOrmModule.forFeature([Promotion])],
  controllers: [PromotionsController],
  providers: [PromotionsService, PricingService],
  exports: [PricingService],
})
export class PromotionsModule {}

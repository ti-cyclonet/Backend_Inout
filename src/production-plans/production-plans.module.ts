import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionPlansService } from './production-plans.service';
import { ProductionPlansController } from './production-plans.controller';
import { ProductionPlan } from './entities/production-plan.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductionPlan, Product])],
  controllers: [ProductionPlansController],
  providers: [ProductionPlansService],
  exports: [ProductionPlansService],
})
export class ProductionPlansModule {}

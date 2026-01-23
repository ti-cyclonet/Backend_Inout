import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseRecord } from './entities/purchase-record.entity';
import { Material } from '../materials/entities/material.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PurchaseRecord, Material])],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryMovementsController } from './inventory-movements.controller';
import { InventoryMovementsService } from './inventory-movements.service';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Material } from '../materials/entities/material.entity';
import { OpeningBalanceController } from './opening-balance.controller';
import { OpeningBalanceService } from './opening-balance.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryMovement, Material])],
  // OpeningBalanceController va primero: sus rutas (opening-balance/...) son más específicas
  controllers: [OpeningBalanceController, InventoryMovementsController],
  providers: [InventoryMovementsService, OpeningBalanceService],
  exports: [InventoryMovementsService, OpeningBalanceService]
})
export class InventoryMovementsModule {}

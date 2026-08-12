import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseLocation } from './entities/warehouse-location.entity';
import { StockTransfer } from './entities/stock-transfer.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Material } from '../materials/entities/material.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Warehouse,
      WarehouseLocation,
      StockTransfer,
      PhysicalCount,
      Material,
      InventoryMovement,
    ]),
  ],
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}

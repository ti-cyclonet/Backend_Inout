import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Sale } from './entities/sale.entity';
import { Product } from '../products/entities/product.entity';
import { CompositionTwo } from '../products/entities/composition-two.entity';
import { CompositionThree } from '../products/entities/composition-three.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, Product, CompositionTwo, CompositionThree, InventoryMovement])],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

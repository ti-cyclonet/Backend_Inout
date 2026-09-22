import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersMarketplaceController } from './orders-marketplace.controller';
import { Order } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Product, InventoryMovement]), UsageCountersModule],
  controllers: [OrdersMarketplaceController, OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

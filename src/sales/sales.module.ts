import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { SalesController } from './sales.controller';
import { Sale } from './entities/sale.entity';
import { Product } from '../products/entities/product.entity';
import { CompositionTwo } from '../products/entities/composition-two.entity';
import { CompositionThree } from '../products/entities/composition-three.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { Order } from '../orders/entities/order.entity';
import { Customer } from '../customers/entities/customer.entity';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, Product, CompositionTwo, CompositionThree, InventoryMovement, Order, Customer]), UsageCountersModule],
  controllers: [SalesController],
  providers: [SalesService, InvoicePdfService],
  exports: [SalesService],
})
export class SalesModule {}

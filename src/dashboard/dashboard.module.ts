import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ModulePanelsService } from './module-panels.service';
import { CustomersModule } from '../customers/customers.module';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { ProductProduction } from '../products/entities/product-production.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderPayment } from '../orders/entities/order-payment.entity';
import { Receivable } from '../credit/entities/receivable.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { PurchaseRecord } from '../purchases/entities/purchase-record.entity';

@Module({
  imports: [CustomersModule, TypeOrmModule.forFeature([Sale, Order, OrderPayment, Receivable, Customer, Product, Material, PurchaseRecord, MaterialT, ProductProduction, InventoryMovement])],
  controllers: [DashboardController],
  providers: [DashboardService, ModulePanelsService],
})
export class DashboardModule {}

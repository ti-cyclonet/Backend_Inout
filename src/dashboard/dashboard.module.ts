import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Sale } from '../sales/entities/sale.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderPayment } from '../orders/entities/order-payment.entity';
import { Receivable } from '../credit/entities/receivable.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { PurchaseRecord } from '../purchases/entities/purchase-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, Order, OrderPayment, Receivable, Customer, Product, Material, PurchaseRecord])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

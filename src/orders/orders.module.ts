import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersMarketplaceController } from './orders-marketplace.controller';
import { Order } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';
import { CreditModule } from '../credit/credit.module';
import { OrderPayment } from './entities/order-payment.entity';
import { OrderSettings } from './entities/order-settings.entity';
import { OrderPaymentsService } from './order-payments.service';
import { OrderAutomationService } from './order-automation.service';
import { ShotraDeliveryService } from './shotra-delivery.service';
import { TenantBrandingModule } from '../tenant-branding/tenant-branding.module';
import { MarketplaceConfigModule } from '../marketplace-config/marketplace-config.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Product, InventoryMovement, OrderPayment, OrderSettings]),
    UsageCountersModule,
    CreditModule,
    MarketplaceConfigModule,
    CloudinaryModule,
    PromotionsModule,
    TenantBrandingModule,
  ],
  controllers: [OrdersMarketplaceController, OrdersController],
  providers: [OrdersService, OrderPaymentsService, OrderAutomationService, ShotraDeliveryService],
  exports: [OrdersService, OrderPaymentsService],
})
export class OrdersModule {}

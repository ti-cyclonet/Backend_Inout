import { EinvoicingModule } from '../einvoicing/einvoicing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SaleReceiptMailService } from './sale-receipt-mail.service';
import { SalePaymentProofService } from './sale-payment-proof.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
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
import { CreditModule } from '../credit/credit.module';
import { TenantBrandingModule } from '../tenant-branding/tenant-branding.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { PaymentReferencesModule } from '../payment-references/payment-references.module';

@Module({
  imports: [EinvoicingModule, PaymentReferencesModule, TypeOrmModule.forFeature([Sale, Product, CompositionTwo, CompositionThree, InventoryMovement, Order, Customer]), UsageCountersModule, CreditModule, TenantBrandingModule, PromotionsModule, CloudinaryModule],
  controllers: [SalesController],
  providers: [SalesService, InvoicePdfService, SaleReceiptMailService, SalePaymentProofService],
  exports: [SalesService],
})
export class SalesModule {}

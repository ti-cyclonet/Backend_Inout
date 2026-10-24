import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantBrandingModule } from '../tenant-branding/tenant-branding.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MarketplaceConfigModule } from '../marketplace-config/marketplace-config.module';
import { ReceivableVoucher } from './entities/receivable-voucher.entity';
import { CreditVouchersService } from './credit-vouchers.service';
import { CreditPayController } from './credit-pay.controller';
import { CreditAccount } from './entities/credit-account.entity';
import { Receivable } from './entities/receivable.entity';
import { ReceivablePayment } from './entities/receivable-payment.entity';
import { CreditSettings } from './entities/credit-settings.entity';
import { CreditRemindersService } from './credit-reminders.service';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditAccount, Receivable, ReceivablePayment, CreditSettings, ReceivableVoucher]), TenantBrandingModule, CloudinaryModule, MarketplaceConfigModule],
  controllers: [CreditController, CreditPayController],
  providers: [CreditService, CreditRemindersService, CreditVouchersService],
  exports: [CreditService],
})
export class CreditModule {}

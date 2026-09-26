import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditAccount } from './entities/credit-account.entity';
import { Receivable } from './entities/receivable.entity';
import { ReceivablePayment } from './entities/receivable-payment.entity';
import { CreditSettings } from './entities/credit-settings.entity';
import { CreditRemindersService } from './credit-reminders.service';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditAccount, Receivable, ReceivablePayment, CreditSettings])],
  controllers: [CreditController],
  providers: [CreditService, CreditRemindersService],
  exports: [CreditService],
})
export class CreditModule {}

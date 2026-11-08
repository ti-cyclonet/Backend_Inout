import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiningTable } from './entities/dining-table.entity';
import { TableReservation } from './entities/table-reservation.entity';
import { DiningSettingsEntity } from './entities/dining-settings.entity';
import { MarketplaceConfig } from '../marketplace-config/entities/marketplace-config.entity';
import { BusinessModulesModule } from '../business-modules/business-modules.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';
import { DiningPublicController } from './dining-public.controller';
import { DiningService } from './dining.service';
import { DiningController } from './dining.controller';
import { PaymentReferencesModule } from '../payment-references/payment-references.module';

@Module({
  imports: [PaymentReferencesModule, TypeOrmModule.forFeature([DiningTable, TableReservation, DiningSettingsEntity, MarketplaceConfig]), BusinessModulesModule, CloudinaryModule, UsageCountersModule],
  controllers: [DiningController, DiningPublicController],
  providers: [DiningService],
  exports: [DiningService],
})
export class DiningModule {}

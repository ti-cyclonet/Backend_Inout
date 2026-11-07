import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiningTable } from './entities/dining-table.entity';
import { TableReservation } from './entities/table-reservation.entity';
import { DiningSettingsEntity } from './entities/dining-settings.entity';
import { MarketplaceConfig } from '../marketplace-config/entities/marketplace-config.entity';
import { BusinessModulesModule } from '../business-modules/business-modules.module';
import { DiningService } from './dining.service';
import { DiningController } from './dining.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DiningTable, TableReservation, DiningSettingsEntity, MarketplaceConfig]), BusinessModulesModule],
  controllers: [DiningController],
  providers: [DiningService],
  exports: [DiningService],
})
export class DiningModule {}

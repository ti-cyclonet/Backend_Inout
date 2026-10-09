import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceConfig } from './entities/marketplace-config.entity';
import { MarketplaceConfigService } from './marketplace-config.service';
import { MarketplaceConfigController } from './marketplace-config.controller';
import { MarketplaceItemStat } from './entities/marketplace-item-stat.entity';
import { MarketplaceStatsService } from './marketplace-stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceConfig, MarketplaceItemStat])],
  controllers: [MarketplaceConfigController],
  providers: [MarketplaceConfigService, MarketplaceStatsService],
  exports: [MarketplaceConfigService],
})
export class MarketplaceConfigModule {}
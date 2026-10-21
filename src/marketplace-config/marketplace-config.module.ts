import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceConfig } from './entities/marketplace-config.entity';
import { MarketplaceConfigService } from './marketplace-config.service';
import { MarketplaceConfigController } from './marketplace-config.controller';
import { MarketplaceItemStat } from './entities/marketplace-item-stat.entity';
import { PlatformSetting } from './entities/platform-setting.entity';
import { MarketplaceStatsService } from './marketplace-stats.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MarketFeatured } from './featured/market-featured.entity';
import { FeaturedService } from './featured/featured.service';
import { FeaturedController } from './featured/featured.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceConfig, MarketplaceItemStat, PlatformSetting, MarketFeatured]), CloudinaryModule],
  controllers: [MarketplaceConfigController, FeaturedController],
  providers: [MarketplaceConfigService, MarketplaceStatsService, FeaturedService],
  exports: [MarketplaceConfigService],
})
export class MarketplaceConfigModule {}
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceConfig } from './entities/marketplace-config.entity';
import { MarketplaceConfigService } from './marketplace-config.service';
import { MarketplaceConfigController } from './marketplace-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceConfig])],
  controllers: [MarketplaceConfigController],
  providers: [MarketplaceConfigService],
  exports: [MarketplaceConfigService],
})
export class MarketplaceConfigModule {}
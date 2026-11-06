import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModules } from './entities/tenant-modules.entity';
import { MarketplaceConfig } from '../marketplace-config/entities/marketplace-config.entity';
import { BusinessModulesService } from './business-modules.service';
import { BusinessModulesController } from './business-modules.controller';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';

@Module({
  imports: [TypeOrmModule.forFeature([TenantModules, MarketplaceConfig]), UsageCountersModule],
  controllers: [BusinessModulesController],
  providers: [BusinessModulesService],
  exports: [BusinessModulesService],
})
export class BusinessModulesModule {}

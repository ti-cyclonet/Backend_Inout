import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceConfig } from './entities/marketplace-config.entity';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';

@Injectable()
export class MarketplaceConfigService {
  constructor(
    @InjectRepository(MarketplaceConfig)
    private readonly marketplaceConfigRepository: Repository<MarketplaceConfig>,
  ) {}

  async updateConfig(dto: UpdateMarketplaceConfigDto): Promise<MarketplaceConfig> {
    let config = await this.marketplaceConfigRepository.findOne({
      where: { tenantId: dto.tenantId },
    });

    if (config) {
      config.selectedProductIds = dto.selectedProductIds;
    } else {
      config = this.marketplaceConfigRepository.create({
        tenantId: dto.tenantId,
        selectedProductIds: dto.selectedProductIds,
      });
    }

    return await this.marketplaceConfigRepository.save(config);
  }

  async getConfig(tenantId: string): Promise<MarketplaceConfig | null> {
    return await this.marketplaceConfigRepository.findOne({
      where: { tenantId },
    });
  }

  async getAllConfigs(): Promise<MarketplaceConfig[]> {
    return await this.marketplaceConfigRepository.find();
  }
}
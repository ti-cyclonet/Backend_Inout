import { Injectable, ConflictException } from '@nestjs/common';
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
      // Update displayMode if provided
      if (dto.displayMode) {
        config.displayMode = dto.displayMode;
      }
      // Update slug if provided
      if ((dto as any).slug) {
        await this.validateSlug((dto as any).slug, config.id);
        config.slug = this.normalizeSlug((dto as any).slug);
      }
    } else {
      const slug = (dto as any).slug || await this.generateSlug(dto.tenantId);
      config = this.marketplaceConfigRepository.create({
        tenantId: dto.tenantId,
        selectedProductIds: dto.selectedProductIds,
        displayMode: dto.displayMode || 'grid',
        slug,
      });
    }

    return await this.marketplaceConfigRepository.save(config);
  }

  async getConfig(tenantId: string): Promise<MarketplaceConfig | null> {
    return await this.marketplaceConfigRepository.findOne({
      where: { tenantId },
    });
  }

  async getConfigBySlug(slug: string): Promise<MarketplaceConfig | null> {
    return await this.marketplaceConfigRepository.findOne({
      where: { slug: this.normalizeSlug(slug) },
    });
  }

  async resolveSlugToTenantId(slug: string): Promise<string | null> {
    const config = await this.getConfigBySlug(slug);
    return config?.tenantId || null;
  }

  async getAllConfigs(): Promise<MarketplaceConfig[]> {
    return await this.marketplaceConfigRepository.find();
  }

  async updateSlug(tenantId: string, newSlug: string): Promise<MarketplaceConfig> {
    const normalized = this.normalizeSlug(newSlug);
    let config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    
    if (!config) {
      // Create config if it doesn't exist
      config = this.marketplaceConfigRepository.create({
        tenantId,
        selectedProductIds: [],
        slug: normalized,
      });
    }

    await this.validateSlug(normalized, config.id);
    config.slug = normalized;
    return await this.marketplaceConfigRepository.save(config);
  }

  private async validateSlug(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.marketplaceConfigRepository.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Este nombre de tienda ya está en uso. Elige otro.');
    }
  }

  private normalizeSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '-')    // replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '')         // trim dashes
      .substring(0, 60);
  }

  private async generateSlug(tenantId: string): Promise<string> {
    // Try to get business name from Authoriza
    try {
      const authorizaUrl = process.env.AUTHORIZA_API_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      if (response.ok) {
        const contract = await response.json();
        const businessName = contract?.user?.basicData?.legalEntityData?.businessName ||
          contract?.user?.basicData?.naturalPersonData?.strFirstName ||
          contract?.businessName || '';
        if (businessName) {
          const slug = this.normalizeSlug(businessName);
          const existing = await this.marketplaceConfigRepository.findOne({ where: { slug } });
          if (!existing) return slug;
          return `${slug}-${Date.now().toString(36).slice(-4)}`;
        }
      }
    } catch {}
    // Fallback: use tenantId prefix
    return `tienda-${tenantId.substring(0, 8)}`;
  }
}
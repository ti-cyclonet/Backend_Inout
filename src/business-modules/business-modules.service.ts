import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantModules } from './entities/tenant-modules.entity';
import { LimitEnforcementService } from '../usage-counters/limit-enforcement.service';
import { BusinessContext, ModuleKey, resolveModules, validateModuleChange } from './business-modules.catalog';
import { MarketplaceConfig } from '../marketplace-config/entities/marketplace-config.entity';
import { resolveMenuExtras } from '../marketplace-config/menu-extras';

@Injectable()
export class BusinessModulesService {
  private readonly logger = new Logger(BusinessModulesService.name);

  constructor(
    @InjectRepository(TenantModules)
    private readonly repo: Repository<TenantModules>,
    @InjectRepository(MarketplaceConfig)
    private readonly marketplaceRepo: Repository<MarketplaceConfig>,
    private readonly limits: LimitEnforcementService,
  ) {}

  /** Sector del contrato (Authoriza). Si no se puede consultar, 'general'. */
  private async sector(tenantId: string): Promise<string> {
    try {
      return (await this.limits.fetchLimits(tenantId)).businessSector || 'general';
    } catch (err) {
      this.logger.warn(`Sin sector para ${tenantId}: ${(err as Error).message}`);
      return 'general';
    }
  }

  /** Cocina oculta (solo domicilios) según la carta de la tienda. */
  private async context(tenantId: string): Promise<BusinessContext> {
    const cfg = await this.marketplaceRepo.findOne({ where: { tenantId }, select: ['id', 'menuExtras'] });
    return { deliveryOnly: resolveMenuExtras(cfg?.menuExtras).deliveryOnly };
  }

  async get(tenantId: string) {
    const [sector, row, ctx] = await Promise.all([
      this.sector(tenantId), this.repo.findOne({ where: { tenantId } }), this.context(tenantId),
    ]);
    return resolveModules(sector, row?.modules, ctx);
  }

  async isEnabled(tenantId: string, key: ModuleKey): Promise<boolean> {
    return !!(await this.get(tenantId)).modules.find((m) => m.key === key)?.enabled;
  }

  async set(tenantId: string, key: unknown, enabled: unknown) {
    const change = validateModuleChange(key, enabled, await this.context(tenantId));
    if (typeof change === 'string') throw new BadRequestException(change);
    let row = await this.repo.findOne({ where: { tenantId } });
    if (!row) row = this.repo.create({ tenantId, modules: {} });
    row.modules = { ...(row.modules || {}), [change.key]: change.enabled };
    await this.repo.save(row);
    return this.get(tenantId);
  }
}

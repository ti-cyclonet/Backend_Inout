import {
  Injectable,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { UsageCounter } from './entities/usage-counter.entity';
import { ALL_VARIABLE_NAMES, VARIABLE_DISPLAY_NAMES } from './constants/resource-variable-map';

interface TenantLimitsResponse {
  contractId: string;
  packageName: string;
  limits: {
    variableName: string;
    displayName: string;
    maxValue: number;
    targetApplication: string;
  }[];
}

interface CacheEntry {
  data: TenantLimitsResponse;
  expiry: number;
}

@Injectable()
export class LimitEnforcementService {
  private readonly logger = new Logger('LimitEnforcementService');
  private readonly limitsCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly authorizaApiUrl: string;

  constructor(
    @InjectRepository(UsageCounter)
    private readonly usageCounterRepository: Repository<UsageCounter>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.authorizaApiUrl =
      this.configService.get<string>('AUTHORIZA_API_URL') ||
      'http://localhost:3000';
  }

  /**
   * Fetch limits for a tenant from Backend_Authoriza.
   * Results are cached in memory with a 5-minute TTL.
   */
  async fetchLimits(tenantId: string): Promise<TenantLimitsResponse> {
    const cached = this.limitsCache.get(tenantId);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const url = `${this.authorizaApiUrl}/api/contracts/tenant/${tenantId}/limits`;
      const response = await firstValueFrom(
        this.httpService.get<TenantLimitsResponse>(url),
      );
      const data = response.data;

      this.limitsCache.set(tenantId, {
        data,
        expiry: Date.now() + this.CACHE_TTL_MS,
      });

      return data;
    } catch (error) {
      // If Authoriza returns 404 (no active contract), propagate as forbidden
      if (error?.response?.status === 404) {
        throw new ForbiddenException({
          error: 'CONTRACT_INACTIVE',
          message:
            'No se encontró un contrato activo para este tenant',
        });
      }
      this.logger.error(
        `Error fetching limits for tenant ${tenantId}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudieron obtener los límites del paquete. Intente más tarde.',
      );
    }
  }

  /**
   * Initialize all 8 counters for a tenant with value 0 if they don't exist.
   */
  async initializeCounters(tenantId: string): Promise<void> {
    for (const variableName of ALL_VARIABLE_NAMES) {
      const existing = await this.usageCounterRepository.findOne({
        where: { tenantId, variableName },
      });
      if (!existing) {
        const counter = this.usageCounterRepository.create({
          tenantId,
          variableName,
          currentCount: 0,
        });
        await this.usageCounterRepository.save(counter);
      }
    }
  }

  /**
   * Validate that the tenant has not exceeded the limit for the given variable,
   * and atomically increment the counter within a transaction.
   */
  async validateAndIncrement(
    tenantId: string,
    variableName: string,
  ): Promise<void> {
    // 1. Fetch limits from Authoriza (cached)
    const limitsResponse = await this.fetchLimits(tenantId);

    const limitDef = limitsResponse.limits.find(
      (l) => l.variableName === variableName,
    );

    // If no limit defined for this variable, allow the operation
    if (!limitDef) {
      return;
    }

    const maxValue = limitDef.maxValue;

    // 2. Atomic check + increment inside a transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Ensure counter exists
      const existingCounter = await queryRunner.manager.findOne(UsageCounter, {
        where: { tenantId, variableName },
      });

      if (!existingCounter) {
        // Initialize this counter
        const newCounter = queryRunner.manager.create(UsageCounter, {
          tenantId,
          variableName,
          currentCount: 0,
        });
        await queryRunner.manager.save(newCounter);
      }

      // SELECT ... FOR UPDATE to lock the row
      const result = await queryRunner.query(
        `SELECT "currentCount" FROM manufacturing.usage_counters
         WHERE "tenantId" = $1 AND "variableName" = $2
         FOR UPDATE`,
        [tenantId, variableName],
      );

      const currentCount = result[0]?.currentCount ?? 0;

      if (currentCount >= maxValue) {
        throw new ForbiddenException({
          error: 'LIMIT_REACHED',
          resource:
            VARIABLE_DISPLAY_NAMES[variableName] || variableName,
          limit: maxValue,
          currentCount,
        });
      }

      // Increment
      await queryRunner.query(
        `UPDATE manufacturing.usage_counters
         SET "currentCount" = "currentCount" + 1, "updatedAt" = NOW()
         WHERE "tenantId" = $1 AND "variableName" = $2`,
        [tenantId, variableName],
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Decrement the counter for a given tenant and variable.
   * If the counter would go below 0, it is set to 0.
   */
  async decrement(tenantId: string, variableName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await queryRunner.query(
        `SELECT "currentCount" FROM manufacturing.usage_counters
         WHERE "tenantId" = $1 AND "variableName" = $2
         FOR UPDATE`,
        [tenantId, variableName],
      );

      if (!result || result.length === 0) {
        // No counter exists, nothing to decrement
        await queryRunner.commitTransaction();
        return;
      }

      const currentCount = result[0].currentCount;
      const newCount = Math.max(0, currentCount - 1);

      await queryRunner.query(
        `UPDATE manufacturing.usage_counters
         SET "currentCount" = $1, "updatedAt" = NOW()
         WHERE "tenantId" = $2 AND "variableName" = $3`,
        [newCount, tenantId, variableName],
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error decrementing counter for tenant ${tenantId}, variable ${variableName}: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all counters for a tenant.
   */
  async getCounters(tenantId: string): Promise<UsageCounter[]> {
    return this.usageCounterRepository.find({ where: { tenantId } });
  }

  /**
   * Invalidate the cache for a specific tenant.
   */
  invalidateCache(tenantId: string): void {
    this.limitsCache.delete(tenantId);
  }

  /**
   * Invalidate the cache for all tenants.
   */
  invalidateAllCache(): void {
    this.limitsCache.clear();
  }

  /**
   * Recalibrate counters for a tenant by counting actual records in the database.
   * This fixes any drift between the counter and the real number of records.
   */
  async recalibrateCounters(tenantId: string): Promise<{
    tenantId: string;
    recalibrated: { variableName: string; previousCount: number; actualCount: number }[];
  }> {
    const recalibrated: { variableName: string; previousCount: number; actualCount: number }[] = [];

    // Count actual records for each variable
    const countQueries: Record<string, string> = {
      nMateriales: `SELECT COUNT(*) as count FROM manufacturing.materials WHERE "strTenantId" = $1`,
      nMaterialesT: `SELECT COUNT(*) as count FROM manufacturing."materials-t" WHERE "strTenantId" = $1`,
      nProductos: `SELECT COUNT(*) as count FROM manufacturing.products WHERE "strTenantId" = $1`,
      nLotes: `SELECT COUNT(*) as count FROM manufacturing.product_productions WHERE "strTenantId" = $1`,
      nClientes: `SELECT COUNT(*) as count FROM manufacturing.customers WHERE "tenantId" = $1 AND "isActive" = true`,
      nVentas: `SELECT COUNT(*) as count FROM manufacturing.sales WHERE "strTenantId" = $1`,
      nSesionesCap: `SELECT COUNT(*) as count FROM manufacturing.training_sessions WHERE "strTenantId" = $1`,
      nProveedores: `SELECT COUNT(*) as count FROM manufacturing.suppliers WHERE "strTenantId" = $1 AND "strStatus" = 'active'`,
    };

    for (const [variableName, query] of Object.entries(countQueries)) {
      try {
        const result = await this.dataSource.query(query, [tenantId]);
        const actualCount = parseInt(result[0]?.count ?? '0', 10);

        // Get current counter value
        const counter = await this.usageCounterRepository.findOne({
          where: { tenantId, variableName },
        });
        const previousCount = counter?.currentCount ?? 0;

        // Update if different
        if (previousCount !== actualCount) {
          if (counter) {
            counter.currentCount = actualCount;
            await this.usageCounterRepository.save(counter);
          } else {
            const newCounter = this.usageCounterRepository.create({
              tenantId,
              variableName,
              currentCount: actualCount,
            });
            await this.usageCounterRepository.save(newCounter);
          }

          recalibrated.push({ variableName, previousCount, actualCount });
        }
      } catch (error) {
        this.logger.warn(
          `Could not recalibrate ${variableName} for tenant ${tenantId}: ${error.message}`,
        );
      }
    }

    return { tenantId, recalibrated };
  }

  /**
   * Check if a tenant is approaching any limit (>= 80%) and return warnings.
   */
  async getUsageWarnings(tenantId: string): Promise<{
    warnings: { variableName: string; displayName: string; currentCount: number; maxValue: number; percentage: number }[];
  }> {
    const limitsResponse = await this.fetchLimits(tenantId);
    const counters = await this.getCounters(tenantId);
    const warnings: { variableName: string; displayName: string; currentCount: number; maxValue: number; percentage: number }[] = [];

    for (const limit of limitsResponse.limits) {
      if (limit.targetApplication !== 'Inout') continue;

      const counter = counters.find(c => c.variableName === limit.variableName);
      const currentCount = counter?.currentCount ?? 0;
      const percentage = limit.maxValue > 0
        ? Math.round((currentCount / limit.maxValue) * 100)
        : 0;

      if (percentage >= 80) {
        warnings.push({
          variableName: limit.variableName,
          displayName: limit.displayName || VARIABLE_DISPLAY_NAMES[limit.variableName] || limit.variableName,
          currentCount,
          maxValue: limit.maxValue,
          percentage,
        });
      }
    }

    return { warnings };
  }
}

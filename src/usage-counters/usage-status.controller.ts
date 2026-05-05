import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { LimitEnforcementService } from './limit-enforcement.service';
import { VARIABLE_DISPLAY_NAMES, ALL_VARIABLE_NAMES } from './constants/resource-variable-map';

@Controller('usage-status')
export class UsageStatusController {
  constructor(
    private readonly limitEnforcementService: LimitEnforcementService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getUsageStatus(@GetTenantId() tenantId: string) {
    // 1. Fetch limits from Authoriza
    const limitsResponse =
      await this.limitEnforcementService.fetchLimits(tenantId);

    // 2. Get current counters
    const counters =
      await this.limitEnforcementService.getCounters(tenantId);

    // 3. Build response combining limits and counters
    const variables = limitsResponse.limits
      .filter((limit) => limit.targetApplication === 'Inout')
      .map((limit) => {
        const counter = counters.find(
          (c) => c.variableName === limit.variableName,
        );
        const currentCount = counter?.currentCount ?? 0;
        const usagePercentage =
          limit.maxValue > 0
            ? Math.round((currentCount / limit.maxValue) * 10000) / 100
            : 0;

        return {
          variableName: limit.variableName,
          displayName:
            limit.displayName ||
            VARIABLE_DISPLAY_NAMES[limit.variableName] ||
            limit.variableName,
          maxValue: limit.maxValue,
          currentCount,
          usagePercentage,
        };
      });

    return {
      tenantId,
      packageName: limitsResponse.packageName,
      variables,
    };
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Indicadores del negocio en sesión (solo sus datos: tenantId del token). */
  @Get('overview')
  getOverview(@GetTenantId() tenantId: string) {
    return this.dashboardService.getOverview(tenantId);
  }
}

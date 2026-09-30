import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { DashboardService } from './dashboard.service';
import { ModulePanelsService } from './module-panels.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly panels: ModulePanelsService,
  ) {}

  /** Indicadores del negocio en sesión (solo sus datos: tenantId del token). */
  @Get('overview')
  getOverview(@GetTenantId() tenantId: string, @Headers('authorization') authorization: string) {
    return this.dashboardService.getOverview(tenantId, authorization);
  }

  /** Paneles de cada módulo (mismos criterios que el Dashboard). */
  @Get('materials')
  materials(@GetTenantId() tenantId: string) {
    return this.panels.materialsPanel(tenantId);
  }

  @Get('products')
  products(@GetTenantId() tenantId: string) {
    return this.panels.productsPanel(tenantId);
  }

  @Get('commercial')
  commercial(@GetTenantId() tenantId: string) {
    return this.panels.commercialPanel(tenantId);
  }

  @Get('customers')
  customers(@GetTenantId() tenantId: string, @Headers('authorization') authorization: string) {
    return this.panels.customersPanel(tenantId, authorization);
  }
}

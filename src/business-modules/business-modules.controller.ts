import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { BusinessModulesService } from './business-modules.service';

/** Funciones de mi negocio: las lee todo el equipo; las cambia el admin. */
@Controller('business-modules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessModulesController {
  constructor(private readonly service: BusinessModulesService) {}

  @Get()
  @Roles('admin', 'operator', 'viewer')
  get(@GetTenantId() tenantId: string) {
    return this.service.get(tenantId);
  }

  @Patch()
  @Roles('admin')
  set(@GetTenantId() tenantId: string, @Body() body: { key?: string; enabled?: boolean }) {
    return this.service.set(tenantId, body?.key, body?.enabled);
  }
}

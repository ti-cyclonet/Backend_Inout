import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { BarcodesService } from './barcodes.service';
import { SetBarcodesDto } from './dto/set-barcodes.dto';

/**
 * Códigos de barras de los ítems vendibles. Consultar: todos los roles
 * (el operador vende leyendo códigos). Asignar: admin y operador.
 */
@Controller('barcodes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BarcodesController {
  constructor(private readonly barcodesService: BarcodesService) {}

  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.barcodesService.findAll(tenantId);
  }

  @Get('lookup/:code')
  lookup(@Param('code') code: string, @GetTenantId() tenantId: string) {
    return this.barcodesService.lookup(tenantId, code);
  }

  @Get(':itemType/:itemId')
  findForItem(@Param('itemType') itemType: string, @Param('itemId', ParseUUIDPipe) itemId: string, @GetTenantId() tenantId: string) {
    return this.barcodesService.findForItem(tenantId, itemType, itemId);
  }

  @Put(':itemType/:itemId')
  @Roles('admin', 'operator')
  setForItem(@Param('itemType') itemType: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: SetBarcodesDto, @GetTenantId() tenantId: string) {
    return this.barcodesService.setForItem(tenantId, itemType, itemId, dto.codes);
  }
}

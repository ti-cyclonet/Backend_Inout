import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  // ═══════ WAREHOUSES ═══════
  @Post()
  @Roles('admin')
  createWarehouse(@Body() data: any, @GetTenantId() tenantId: string) {
    return this.service.createWarehouse(data, tenantId);
  }

  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.service.findAllWarehouses(tenantId);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.service.removeWarehouse(id, tenantId);
  }

  // ═══════ LOCATIONS ═══════
  @Post('locations')
  @Roles('admin')
  createLocation(@Body() data: any, @GetTenantId() tenantId: string) {
    return this.service.createLocation(data, tenantId);
  }

  @Get(':warehouseId/locations')
  findLocations(@Param('warehouseId') warehouseId: string, @GetTenantId() tenantId: string) {
    return this.service.findLocationsByWarehouse(warehouseId, tenantId);
  }

  // ═══════ TRANSFERS ═══════
  @Post('transfers')
  @Roles('admin', 'operator')
  createTransfer(@Body() data: any, @GetTenantId() tenantId: string) {
    return this.service.createTransfer(data, tenantId);
  }

  @Get('transfers')
  findTransfers(@GetTenantId() tenantId: string) {
    return this.service.findTransfers(tenantId);
  }

  // ═══════ PHYSICAL COUNT ═══════
  @Post('physical-count')
  @Roles('admin', 'operator')
  createCount(@Body() data: any, @GetTenantId() tenantId: string) {
    return this.service.createPhysicalCount(data, tenantId);
  }

  @Get('physical-counts')
  findCounts(@GetTenantId() tenantId: string) {
    return this.service.findPhysicalCounts(tenantId);
  }

  @Patch('physical-count/:id')
  @Roles('admin', 'operator')
  updateCount(@Param('id') id: string, @Body() data: any, @GetTenantId() tenantId: string) {
    return this.service.updatePhysicalCount(id, tenantId, data);
  }

  @Post('physical-count/:id/apply')
  @Roles('admin')
  applyCount(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.service.applyPhysicalCount(id, tenantId);
  }
}

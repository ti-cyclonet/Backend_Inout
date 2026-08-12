import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { InventoryMovementsService } from './inventory-movements.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory-movements')
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Post()
  @Roles('admin', 'operator')
  create(@Body() data: any, @Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.service.createAndUpdateStock({
      ...data,
      strTenantId: tenantId,
    });
  }

  @Get('material/:materialId')
  findByMaterial(
    @Param('materialId') materialId: string,
    @Request() req: any
  ) {
    const tenantId = req.user?.tenantId;
    return this.service.findByMaterial(materialId, tenantId);
  }

  @Get('transformed-material/:transformedMaterialId')
  findByTransformedMaterial(
    @Param('transformedMaterialId') transformedMaterialId: string,
    @Request() req: any
  ) {
    const tenantId = req.user?.tenantId;
    return this.service.findByTransformedMaterial(transformedMaterialId, tenantId);
  }

  @Get('product/:productId')
  findByProduct(
    @Param('productId') productId: string,
    @Request() req: any
  ) {
    const tenantId = req.user?.tenantId;
    return this.service.findByProduct(productId, tenantId);
  }
}

import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { InventoryMovementsService } from './inventory-movements.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventory-movements')
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

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

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InventoryMovementsService } from './inventory-movements.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventory-movements')
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Get('material/:materialId')
  findByMaterial(@Param('materialId') materialId: string) {
    return this.service.findByMaterial(materialId);
  }
}

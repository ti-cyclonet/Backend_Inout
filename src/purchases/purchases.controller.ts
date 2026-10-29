import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseRecordDto, CreateBulkPurchaseDto, UpdatePurchaseExpirationDto } from './dto/create-purchase-record.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @Roles('admin', 'operator')
  create(@Body() createDto: CreatePurchaseRecordDto, @Request() req) {
    const tenantId = req.user.tenantId;
    return this.purchasesService.create(createDto, tenantId);
  }

  @Post('bulk')
  @Roles('admin', 'operator')
  createBulk(@Body() createBulkDto: CreateBulkPurchaseDto, @Request() req) {
    const tenantId = req.user.tenantId;
    return this.purchasesService.createBulk(createBulkDto, tenantId);
  }

  @Get('material/:materialId')
  findByMaterial(@Param('materialId') materialId: string, @Request() req) {
    const tenantId = req.user.tenantId;
    return this.purchasesService.findByMaterial(materialId, tenantId);
  }

  /** Corrige o quita la fecha de vencimiento de un lote (compra). */
  @Patch(':id/expiration')
  @Roles('admin', 'operator')
  updateExpiration(@Param('id') id: string, @Body() dto: UpdatePurchaseExpirationDto, @Request() req) {
    return this.purchasesService.updateExpiration(id, dto.expirationDate ?? null, req.user.tenantId);
  }
}

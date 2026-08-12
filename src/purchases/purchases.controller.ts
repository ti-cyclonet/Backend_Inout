import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseRecordDto, CreateBulkPurchaseDto } from './dto/create-purchase-record.dto';
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
}

import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseRecordDto } from './dto/create-purchase-record.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  create(@Body() createDto: CreatePurchaseRecordDto, @Request() req) {
    const tenantId = req.user.tenantId;
    return this.purchasesService.create(createDto, tenantId);
  }

  @Get('material/:materialId')
  findByMaterial(@Param('materialId') materialId: string, @Request() req) {
    const tenantId = req.user.tenantId;
    return this.purchasesService.findByMaterial(materialId, tenantId);
  }
}

import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { CheckLimit } from '../usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from '../usage-counters/guards/limit-enforcement.guard';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @UseGuards(JwtAuthGuard, LimitEnforcementGuard)
  @Post()
  @CheckLimit('nVentas')
  create(@Body() createDto: CreateSaleDto, @GetTenantId() tenantId: string) {
    return this.salesService.create(createDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.salesService.findAll(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  getStats(@GetTenantId() tenantId: string) {
    return this.salesService.getStats(tenantId);
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.salesService.findByProduct(productId);
  }
}

import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductionPlansService } from './production-plans.service';
import { UpsertProductionPlanDto } from './dto/upsert-production-plan.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTenantId } from 'src/common/decorators/get-tenant-id.decorator';

@Controller('production-plans')
@UseGuards(JwtAuthGuard)
export class ProductionPlansController {
  constructor(private readonly productionPlansService: ProductionPlansService) {}

  @Get()
  findByPeriod(@Query('periodId') periodId: string, @GetTenantId() tenantId: string) {
    return this.productionPlansService.findByPeriod(tenantId, periodId);
  }

  @Get('product/:productId')
  findOneForProduct(
    @Param('productId') productId: string,
    @Query('periodId') periodId: string,
    @GetTenantId() tenantId: string,
  ) {
    return this.productionPlansService.findOneForProduct(tenantId, productId, periodId);
  }

  @Post()
  upsert(@Body() dto: UpsertProductionPlanDto, @GetTenantId() tenantId: string) {
    return this.productionPlansService.upsert(tenantId, dto);
  }
}

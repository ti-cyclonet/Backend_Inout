import { Controller, Get, Post, Delete, Param, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { CheckLimit } from '../usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from '../usage-counters/guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from '../usage-counters/interceptors/usage-warning.interceptor';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.suppliersService.findAll(tenantId);
  }

  @Post()
  @UseGuards(LimitEnforcementGuard)
  @CheckLimit('nProveedores')
  @UseInterceptors(UsageWarningInterceptor)
  create(@Body() createSupplierDto: CreateSupplierDto, @GetTenantId() tenantId: string) {
    return this.suppliersService.create(createSupplierDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.suppliersService.remove(id, tenantId);
  }
}

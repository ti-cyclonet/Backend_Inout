import { Controller, Get, Post, Delete, Body, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CheckLimit } from '../usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from '../usage-counters/guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from '../usage-counters/interceptors/usage-warning.interceptor';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @UseGuards(LimitEnforcementGuard)
  @CheckLimit('nClientes')
  @UseInterceptors(UsageWarningInterceptor)
  @Roles('admin', 'operator')
  create(@Body() dto: CreateCustomerDto, @GetTenantId() tenantId: string) {
    return this.customersService.create(dto, tenantId);
  }

  @Get()
  findByTenant(@GetTenantId() tenantId: string) {
    return this.customersService.findByTenantId(tenantId);
  }

  @Get('with-details')
  getCustomersWithDetails(@GetTenantId() tenantId: string) {
    return this.customersService.getCustomersWithDetails(tenantId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}

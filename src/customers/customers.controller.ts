import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
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
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}

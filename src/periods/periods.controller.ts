import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { PeriodsService } from './periods.service';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('periods')
@UseGuards(JwtAuthGuard)
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Post()
  create(@Body() createPeriodDto: any, @GetTenantId() tenantId: string) {
    return this.periodsService.create(createPeriodDto, tenantId);
  }

  @Post('subperiods')
  createSubperiod(@Body() createSubperiodDto: any, @GetTenantId() tenantId: string) {
    return this.periodsService.createSubperiod(createSubperiodDto, tenantId);
  }

  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.periodsService.findAll(tenantId);
  }

  @Get('active/current')
  getActivePeriod(@GetTenantId() tenantId: string) {
    return this.periodsService.getActivePeriod(tenantId);
  }

  @Get(':id/customer-parameters')
  getCustomerParameters(@Param('id') id: string) {
    return this.periodsService.getCustomerParameters(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.periodsService.activate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.periodsService.remove(id);
  }
}
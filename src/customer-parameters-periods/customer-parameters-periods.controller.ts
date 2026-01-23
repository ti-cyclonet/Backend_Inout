import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CustomerParametersPeriodsService } from './customer-parameters-periods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('customer-parameters-periods')
@UseGuards(JwtAuthGuard)
export class CustomerParametersPeriodsController {
  constructor(private readonly service: CustomerParametersPeriodsService) {}

  @Post()
  create(@Body() createDto: any) {
    return this.service.create(createDto);
  }

  @Get('period/:id')
  findByPeriod(@Param('id') periodId: string) {
    return this.service.findByPeriod(periodId);
  }
}

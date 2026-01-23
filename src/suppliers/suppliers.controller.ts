import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(@Request() req) {
    const tenantId = req.user.tenantId;
    return this.suppliersService.findAll(tenantId);
  }

  @Post()
  create(@Body() createSupplierDto: CreateSupplierDto, @Request() req) {
    const tenantId = req.user.tenantId;
    return this.suppliersService.create(createSupplierDto, tenantId);
  }
}

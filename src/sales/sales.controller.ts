import { Controller, Get, Post, Body, Param, UseGuards, UseInterceptors, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { SalesService } from './sales.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { CheckLimit } from '../usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from '../usage-counters/guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from '../usage-counters/interceptors/usage-warning.interceptor';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard, LimitEnforcementGuard)
  @Post()
  @CheckLimit('nVentas')
  @UseInterceptors(UsageWarningInterceptor)
  @Roles('admin', 'operator')
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

  @UseGuards(JwtAuthGuard)
  @Get('chart-data')
  getChartData(@GetTenantId() tenantId: string) {
    return this.salesService.getChartData(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/invoice-pdf')
  async getInvoicePdf(
    @Param('id') id: string,
    @GetTenantId() tenantId: string,
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.invoicePdfService.generateInvoicePdf(id, tenantId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="factura-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.end(pdfBuffer);
    } catch (error) {
      throw new NotFoundException('No se pudo generar la factura PDF');
    }
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.salesService.findByProduct(productId);
  }
}

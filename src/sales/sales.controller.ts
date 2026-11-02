import { Controller, Get, Post, Body, Param, Query, Req, UseGuards, UseInterceptors, Res, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { SalesService } from './sales.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateSaleDto, VoidSaleDto } from './dto/create-sale.dto';
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

  /** ?anuladas=1 incluye las ventas anuladas (solo la lista de ventas las muestra). */
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@GetTenantId() tenantId: string, @Query('anuladas') anuladas?: string) {
    return this.salesService.findAll(tenantId, anuladas === '1' || anuladas === 'true');
  }

  /** Anular una venta registrada por error: devuelve el stock. Solo administrador. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/void')
  @Roles('admin')
  voidSale(@Param('id') id: string, @Body() dto: VoidSaleDto, @GetTenantId() tenantId: string, @Req() req: Request) {
    return this.salesService.voidSale(tenantId, id, dto.reason, (req.user as any)?.email);
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

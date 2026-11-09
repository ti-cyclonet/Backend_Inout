import { Body, Controller, Get, Module, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { EinvoicingService } from './einvoicing.service';

/** Configuración › Facturación electrónica (el núcleo está en Authoriza). */
@Controller('einvoicing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EinvoicingController {
  constructor(private readonly service: EinvoicingService) {}

  @Get('status')
  @Roles('admin', 'operator')
  status(@GetTenantId() tenantId: string) {
    return this.service.status(tenantId, true);
  }

  /** Activar el complemento: el administrador acepta los términos del servicio. */
  @Post('request')
  @Roles('admin')
  request(@GetTenantId() tenantId: string, @Body() body: { tier: string; acceptTerms: boolean }, @Req() req: any) {
    return this.service.requestAddon(tenantId, body, req.user, req.ip);
  }

  @Post('cancel')
  @Roles('admin')
  cancel(@GetTenantId() tenantId: string) {
    return this.service.cancelAddon(tenantId);
  }

  @Put('issuer')
  @Roles('admin')
  issuer(@GetTenantId() tenantId: string, @Body() body: any) {
    return this.service.saveIssuer(tenantId, body);
  }

  @Post('resolutions')
  @Roles('admin')
  resolution(@GetTenantId() tenantId: string, @Body() body: any) {
    return this.service.addResolution(tenantId, body);
  }

  /** Reintenta el documento de una venta que quedó con error (p. ej. faltaba el correo del cliente). */
  @Post('sales/:id/retry')
  @Roles('admin', 'operator')
  async retry(@GetTenantId() tenantId: string, @Param('id') id: string) {
    await this.service.emitForSale(tenantId, id, true);
    return this.service.documentsForSale(tenantId, id);
  }

  /** Documentos electrónicos de una venta (factura o POS y su nota crédito). */
  @Get('sales/:id')
  @Roles('admin', 'operator', 'viewer')
  saleDocuments(@GetTenantId() tenantId: string, @Param('id') id: string) {
    return this.service.documentsForSale(tenantId, id);
  }
}

@Module({
  controllers: [EinvoicingController],
  providers: [EinvoicingService],
  exports: [EinvoicingService],
})
export class EinvoicingModule {}

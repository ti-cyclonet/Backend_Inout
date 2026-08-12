import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BusinessParamsService } from './business-params.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';

@Controller('business-params')
@UseGuards(JwtAuthGuard)
export class BusinessParamsController {
  constructor(private readonly businessParamsService: BusinessParamsService) {}

  /**
   * GET /business-params
   * Retorna todos los parámetros configurados del período activo.
   */
  @Get()
  async getAll(@GetTenantId() tenantId: string) {
    return this.businessParamsService.getParams(tenantId);
  }

  /**
   * GET /business-params/tax?subtotal=100000
   * Calcula el IVA sobre un subtotal.
   */
  @Get('tax')
  async calculateTax(@GetTenantId() tenantId: string, @Query('subtotal') subtotal: string) {
    const amount = parseFloat(subtotal || '0');
    const tax = await this.businessParamsService.calculateTax(tenantId, amount);
    const ivaPercent = await this.businessParamsService.getParam(tenantId, 'IVA_PORCENTAJE');
    return { subtotal: amount, ivaPercent, tax, total: amount + tax };
  }

  /**
   * GET /business-params/suggested-price?cost=50000
   * Calcula el precio de venta sugerido según margen configurado.
   */
  @Get('suggested-price')
  async getSuggestedPrice(@GetTenantId() tenantId: string, @Query('cost') cost: string) {
    const costValue = parseFloat(cost || '0');
    const suggestedPrice = await this.businessParamsService.calculateSuggestedPrice(tenantId, costValue);
    const marginPercent = await this.businessParamsService.getParam(tenantId, 'PORCENTAJE_GANANCIA');
    return { cost: costValue, marginPercent, suggestedPrice };
  }

  /**
   * GET /business-params/validate-discount?percent=15
   * Valida si un descuento es permitido.
   */
  @Get('validate-discount')
  async validateDiscount(@GetTenantId() tenantId: string, @Query('percent') percent: string) {
    const discountPercent = parseFloat(percent || '0');
    return this.businessParamsService.validateDiscount(tenantId, discountPercent);
  }

  /**
   * GET /business-params/loyalty-points?amount=100000
   * Calcula puntos de fidelidad para un monto de compra.
   */
  @Get('loyalty-points')
  async getLoyaltyPoints(@GetTenantId() tenantId: string, @Query('amount') amount: string) {
    const totalAmount = parseFloat(amount || '0');
    const points = await this.businessParamsService.calculateLoyaltyPoints(tenantId, totalAmount);
    return { amount: totalAmount, points };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Servicio que obtiene los parámetros comerciales configurados
 * por el tenant en su período activo.
 * 
 * Parámetros disponibles:
 * - IVA_PORCENTAJE: % de IVA (default 0)
 * - PORCENTAJE_GANANCIA: % de margen de ganancia (default 0)
 * - PORCENTAJE_DESCUENTO_MAX: % máximo de descuento (default 100)
 * - PENALIZACION_MORA: % de penalización por mora (default 0)
 * - INTERES_CREDITO: % de interés mensual para ventas a crédito (default 0)
 * - PUNTOS_POR_COMPRA: puntos por cada compra (default 10)
 * - PUNTOS_POR_PESO: puntos por cada $X gastado (default 10000)
 * - DIAS_VIGENCIA_COTIZACION: días de vigencia de cotización (default 15)
 */
@Injectable()
export class BusinessParamsService {
  private readonly logger = new Logger(BusinessParamsService.name);
  private readonly authorizaUrl: string;

  // Valores por defecto cuando no hay parámetro configurado
  private readonly defaults: Record<string, number> = {
    IVA_PORCENTAJE: 0,
    IVA_PORCENTAJE_REDUCIDO: 0,
    INC_PORCENTAJE: 0,
    PORCENTAJE_GANANCIA: 0,
    PORCENTAJE_DESCUENTO_MAX: 100,
    PENALIZACION_MORA: 0,
    INTERES_CREDITO: 0,
    PUNTOS_POR_COMPRA: 10,
    PUNTOS_POR_PESO: 10000,
    DIAS_VIGENCIA_COTIZACION: 15,
  };

  constructor(private configService: ConfigService) {
    this.authorizaUrl = this.configService.get<string>('AUTHORIZA_API_URL') || 'http://localhost:3000';
  }

  /**
   * Obtiene todos los parámetros configurados para un tenant en su período activo.
   * Retorna un mapa code → value (numérico o string según el tipo).
   */
  async getParams(tenantId: string): Promise<Record<string, any>> {
    try {
      // 1. Get active period for tenant
      const periodResponse = await fetch(`${this.authorizaUrl}/api/periods/active/tenant/${tenantId}`);
      if (!periodResponse.ok) {
        return { ...this.defaults };
      }

      const period = await periodResponse.json();
      if (!period || !period.id) {
        return { ...this.defaults };
      }

      // 2. Get parameters for that period
      const paramsResponse = await fetch(`${this.authorizaUrl}/api/customer-parameters-periods/period/${period.id}`);
      if (!paramsResponse.ok) {
        return { ...this.defaults };
      }

      const params = await paramsResponse.json();
      const result: Record<string, any> = { ...this.defaults };

      for (const param of params) {
        const code = param.customerParameter?.code || param.code;
        const status = (param.status || '').toUpperCase();
        if (!code || status !== 'ACTIVE') continue;

        const dataType = param.customerParameter?.dataType || 'number';
        if (dataType === 'string') {
          result[code] = param.value || '';
        } else {
          const value = parseFloat(param.value?.toString() || '0');
          if (!isNaN(value)) {
            result[code] = value;
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(`Error obteniendo parámetros para tenant ${tenantId}: ${error.message}`);
      return { ...this.defaults };
    }
  }

  /**
   * Obtiene un parámetro específico por código.
   */
  async getParam(tenantId: string, code: string): Promise<number> {
    const params = await this.getParams(tenantId);
    return params[code] ?? this.defaults[code] ?? 0;
  }

  /**
   * Calcula el impuesto sobre un monto.
   * Si INC está configurado, usa INC (restaurantes). Si no, usa IVA.
   * Retorna { tax, taxType, taxPercent }
   */
  async calculateTax(tenantId: string, subtotal: number): Promise<number> {
    const params = await this.getParams(tenantId);
    // INC takes precedence for restaurants/food services
    const incPercent = Number(params['INC_PORCENTAJE'] || 0);
    const ivaPercent = Number(params['IVA_PORCENTAJE'] || 0);
    const effectiveRate = incPercent > 0 ? incPercent : ivaPercent;
    return subtotal * (effectiveRate / 100);
  }

  /**
   * Returns the effective tax info (type + percent).
   */
  async getTaxInfo(tenantId: string): Promise<{ taxType: 'IVA' | 'INC' | 'NONE'; percent: number }> {
    const params = await this.getParams(tenantId);
    const inc = Number(params['INC_PORCENTAJE'] || 0);
    const iva = Number(params['IVA_PORCENTAJE'] || 0);
    if (inc > 0) return { taxType: 'INC', percent: inc };
    if (iva > 0) return { taxType: 'IVA', percent: iva };
    return { taxType: 'NONE', percent: 0 };
  }

  /**
   * Calcula el precio de venta sugerido basado en costo + margen de ganancia.
   */
  async calculateSuggestedPrice(tenantId: string, cost: number): Promise<number> {
    const marginPercent = await this.getParam(tenantId, 'PORCENTAJE_GANANCIA');
    return cost * (1 + marginPercent / 100);
  }

  /**
   * Valida que un descuento no exceda el máximo permitido.
   */
  async validateDiscount(tenantId: string, discountPercent: number): Promise<{ valid: boolean; maxAllowed: number }> {
    const maxDiscount = await this.getParam(tenantId, 'PORCENTAJE_DESCUENTO_MAX');
    return {
      valid: discountPercent <= maxDiscount,
      maxAllowed: maxDiscount,
    };
  }

  /**
   * Calcula los puntos de fidelidad para una compra.
   */
  async calculateLoyaltyPoints(tenantId: string, totalAmount: number): Promise<number> {
    const params = await this.getParams(tenantId);
    const pointsPerPurchase = params.PUNTOS_POR_COMPRA || 10;
    const pointsPerWeight = params.PUNTOS_POR_PESO || 10000;

    // Puntos por la compra + puntos por monto
    const amountPoints = pointsPerWeight > 0 ? Math.floor(totalAmount / pointsPerWeight) : 0;
    return pointsPerPurchase + amountPoints;
  }

  /**
   * Calcula el interés de crédito sobre un monto por X días.
   */
  async calculateCreditInterest(tenantId: string, amount: number, days: number): Promise<number> {
    const monthlyRate = await this.getParam(tenantId, 'INTERES_CREDITO');
    const dailyRate = monthlyRate / 30;
    return amount * (dailyRate / 100) * days;
  }

  /**
   * Calcula la penalización por mora.
   */
  async calculateLatePenalty(tenantId: string, amount: number, daysLate: number): Promise<number> {
    const penaltyRate = await this.getParam(tenantId, 'PENALIZACION_MORA');
    return amount * (penaltyRate / 100) * daysLate;
  }

  /**
   * Obtiene los días de vigencia de cotización.
   */
  async getQuoteValidityDays(tenantId: string): Promise<number> {
    return this.getParam(tenantId, 'DIAS_VIGENCIA_COTIZACION');
  }
}

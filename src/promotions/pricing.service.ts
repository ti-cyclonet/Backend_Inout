import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { Combo } from '../combos/entities/combo.entity';
import { Promotion } from './entities/promotion.entity';
import { BusinessParamsService } from '../config/business-params.service';
import { AppliedPromotion, bestPromotion, bogotaMoment, LocalMoment, PricingChannel, PromotionRule } from './promotion-engine';

/**
 * ENFORCE: el servidor fija el precio (MarketPlace: el cliente no es de fiar).
 * SUGGEST: panel del negocio. Si la línea no trae precio se usa el de la
 * promoción; si el usuario escribió otro precio se respeta (es su decisión),
 * pero entonces la promoción no se marca como aplicada.
 */
export type PricingMode = 'ENFORCE' | 'SUGGEST';

export interface PricingResult {
  items: any[];
  /** Suma a precio normal (sin promociones). */
  listSubtotal: number;
  /** Suma a precio cobrado. */
  subtotal: number;
  /** Descuento total por promociones aplicadas. */
  promoDiscount: number;
  /** Tope de descuento del período (PORCENTAJE_DESCUENTO_MAX). */
  maxDiscountPercent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => Number(v) || 0;
const ITEM_TYPES = ['product', 'material', 'material_t', 'kit', 'combo'] as const;
type PriceableType = (typeof ITEM_TYPES)[number];

export function toRule(p: Promotion): PromotionRule {
  return {
    id: p.strId,
    name: p.strName,
    status: p.strStatus,
    discountType: p.strDiscountType,
    value: num(p.fltValue),
    scope: p.strScope,
    targets: Array.isArray(p.targets) ? p.targets : [],
    channel: p.strChannel,
    startDate: String(p.dtmStartDate).slice(0, 10),
    endDate: p.dtmEndDate ? String(p.dtmEndDate).slice(0, 10) : null,
    weekdays: Array.isArray(p.weekdays) ? p.weekdays : null,
    timeFrom: p.strTimeFrom || null,
    timeTo: p.strTimeTo || null,
  };
}

@Injectable()
export class PricingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly businessParams: BusinessParamsService,
  ) {}

  /** Promociones activas del tenant (las de vigencia se filtran en el motor). */
  async activeRules(tenantId: string, manager: EntityManager = this.dataSource.manager): Promise<PromotionRule[]> {
    const list = await manager.find(Promotion, { where: { strTenantId: tenantId, strStatus: 'active' } });
    return list.map(toRule);
  }

  async maxDiscountPercent(tenantId: string): Promise<number> {
    try {
      const params = await this.businessParams.getParams(tenantId);
      const max = Number(params.PORCENTAJE_DESCUENTO_MAX);
      return Number.isFinite(max) && max >= 0 ? Math.min(100, max) : 100;
    } catch {
      return 100;
    }
  }

  /**
   * Pone precio a las líneas de un pedido/venta: precio normal desde la base
   * de datos, mejor promoción vigente (con el tope del período) y foto de la
   * promoción en la línea (`listPrice`, `promotion`). Las líneas ya
   * expandidas de un combo (traen `combo`) pasan sin cambios.
   *
   * En las líneas de combo virtual deja `serverUnitPrice`, que usa
   * expandComboLines para prorratear entre los componentes.
   */
  async priceLines(
    tenantId: string,
    items: any[] | null | undefined,
    channel: PricingChannel,
    mode: PricingMode,
    options: { manager?: EntityManager; now?: Date } = {},
  ): Promise<PricingResult> {
    const manager = options.manager || this.dataSource.manager;
    const maxDiscountPercent = await this.maxDiscountPercent(tenantId);
    const result: PricingResult = { items: [], listSubtotal: 0, subtotal: 0, promoDiscount: 0, maxDiscountPercent };
    if (!Array.isArray(items) || items.length === 0) return { ...result, items: items as any };

    const rules = await this.activeRules(tenantId, manager);
    const at: LocalMoment = bogotaMoment(options.now);
    const cache = new Map<string, any>();

    for (const raw of items) {
      if (!raw?.productId || raw.combo) {
        result.items.push(raw);
        const t = num(raw?.subtotal) || num(raw?.quantity) * num(raw?.unitPrice);
        result.subtotal += t;
        result.listSubtotal += t;
        continue;
      }
      const itemType: PriceableType = (ITEM_TYPES as readonly string[]).includes(raw.itemType) ? raw.itemType : 'product';
      const entity = await this.loadItem(manager, tenantId, itemType, raw.productId, cache);
      const quantity = num(raw.quantity);
      const line: any = { ...raw, itemType };
      delete line.promotion;
      delete line.serverUnitPrice;

      if (!entity) {
        // Lo valida luego el flujo de stock (404 con el nombre); aquí no se toca
        result.items.push(raw);
        continue;
      }

      const listPrice = this.listPriceOf(itemType, entity);
      const promo: AppliedPromotion | null = bestPromotion(
        rules,
        { itemType, id: entity.strId, categoryId: itemType === 'product' ? entity.intCategoryId : entity.categoryId },
        listPrice,
        at,
        channel,
        maxDiscountPercent,
      );
      const promoPrice = round2(listPrice - (promo?.discountPerUnit || 0));

      const clientPrice = raw.unitPrice === null || raw.unitPrice === undefined || raw.unitPrice === '' ? null : num(raw.unitPrice);
      const unitPrice = mode === 'ENFORCE' || clientPrice === null ? promoPrice : clientPrice;
      // Promoción aplicada solo si efectivamente se cobró su precio
      const applied = promo && Math.abs(unitPrice - promoPrice) < 0.5 ? promo : null;

      line.listPrice = listPrice;
      line.unitPrice = unitPrice;
      line.subtotal = round2(unitPrice * quantity);
      if (applied) line.promotion = applied;
      if (itemType === 'combo') line.serverUnitPrice = unitPrice;
      if (mode === 'ENFORCE') line.productName = this.nameOf(itemType, entity);

      result.items.push(line);
      result.subtotal += line.subtotal;
      result.listSubtotal += round2(listPrice * quantity);
      if (applied) result.promoDiscount += round2(applied.discountPerUnit * quantity);
    }

    result.subtotal = round2(result.subtotal);
    result.listSubtotal = round2(result.listSubtotal);
    result.promoDiscount = round2(result.promoDiscount);
    return result;
  }

  private async loadItem(manager: EntityManager, tenantId: string, itemType: PriceableType, id: string, cache: Map<string, any>) {
    const key = `${itemType}:${id}`;
    if (cache.has(key)) return cache.get(key);
    const Entity = itemType === 'product' ? Product : itemType === 'material' ? Material : itemType === 'material_t' ? MaterialT : Combo;
    let entity: any = null;
    try {
      entity = await manager.findOne(Entity as any, { where: { strId: id, strTenantId: tenantId } });
    } catch {
      entity = null; // id con formato inválido
    }
    // Un kit debe ser KIT y un combo VIRTUAL; si no, se deja al flujo de stock/expansión el error
    if (entity && itemType === 'kit' && entity.strType !== 'KIT') entity = null;
    if (entity && itemType === 'combo' && entity.strType !== 'VIRTUAL') entity = null;
    cache.set(key, entity);
    return entity;
  }

  private listPriceOf(itemType: PriceableType, entity: any): number {
    if (itemType === 'material' || itemType === 'material_t') return num(entity.fltSalePrice);
    return num(entity.fltPrice);
  }

  private nameOf(itemType: PriceableType, entity: any): string {
    if (itemType === 'material' || itemType === 'material_t') return `${entity.strName} - ${entity.strSalePresentation || ''}`.trim();
    return entity.strName;
  }
}

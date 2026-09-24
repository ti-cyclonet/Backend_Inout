import { BadRequestException } from '@nestjs/common';

/**
 * Tipo de ítem vendible. Los pedidos/ventas históricos no traen itemType:
 * se asume 'product'.
 */
export type SellableItemType = 'product' | 'material' | 'material_t';

export const SELLABLE_ITEM_TYPES: SellableItemType[] = ['product', 'material', 'material_t'];

export function normalizeItemType(value: any): SellableItemType {
  return SELLABLE_ITEM_TYPES.includes(value) ? value : 'product';
}

interface ResaleFields {
  blnForResale?: boolean;
  strSalePresentation?: string;
  fltPresentationQuantity?: number;
  fltSalePrice?: number;
}

/**
 * Un material marcado para reventa debe tener presentación, cantidad por
 * presentación y precio de venta; sin ellos no se puede convertir el pedido
 * (en presentaciones) a stock (en unidad de medida) ni cobrarlo.
 */
export function assertResaleConfig(material: ResaleFields): void {
  if (!material.blnForResale) return;
  const missing: string[] = [];
  if (!material.strSalePresentation?.trim()) missing.push('nombre de la presentación');
  if (!(Number(material.fltPresentationQuantity) > 0)) missing.push('cantidad por presentación');
  if (!(Number(material.fltSalePrice) > 0)) missing.push('precio de venta');
  if (missing.length > 0) {
    throw new BadRequestException(`Para habilitar la reventa falta: ${missing.join(', ')}`);
  }
}

/**
 * Forma común (tipo "producto") con la que Ventas, Pedidos y el MarketPlace
 * consumen un material de reventa: precio y stock expresados por presentación.
 */
export function mapResaleItem(material: any, itemType: 'material' | 'material_t', images: { strId: string; strImageUrl: string }[] = []) {
  const factor = Number(material.fltPresentationQuantity) || 0;
  const available = Number(material.ingQuantity || 0) - Number(material.ingReservedStock || 0);
  const availableUnits = factor > 0 ? Math.max(0, Math.floor(available / factor)) : 0;
  return {
    strId: material.strId,
    itemType,
    strCode: material.strCode,
    strName: `${material.strName} - ${material.strSalePresentation}`,
    strBaseName: material.strName,
    strSalePresentation: material.strSalePresentation,
    fltPresentationQuantity: factor,
    strUnitMeasure: material.strUnitMeasure,
    strDescription: material.strDescription,
    fltPrice: Number(material.fltSalePrice) || 0,
    // Compatibilidad con los consumidores de productos (stock por presentación)
    ingQuantity: availableUnits,
    ingReservedStock: 0,
    strStatus: material.strStatus,
    blnMarketplaceVisible: material.blnMarketplaceVisible !== false,
    categoryId: material.categoryId ?? null,
    images,
  };
}

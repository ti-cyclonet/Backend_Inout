import { ResolvedStockLine } from './stock-availability';

/**
 * Ganancia de una venta o de un pedido facturado: lo cobrado sin impuestos ni
 * domicilio, menos el costo de lo vendido al momento de facturar. Se guarda
 * en la venta/pedido y el panel la muestra en una burbuja. Funciones puras
 * (sale-profit.spec.ts).
 */

export interface SaleProfit {
  /** Ingreso de la venta: total − impuestos − domicilio. */
  revenue: number;
  /** Costo de lo vendido (costo por unidad de stock × cantidad en stock). */
  cost: number;
  profit: number;
  /** Margen sobre el ingreso (%), null si no hubo ingreso. */
  marginPercent: number | null;
  /** Algún ítem no tiene costo registrado: la ganancia sale mayor a la real. */
  costIncomplete: boolean;
}

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Costo por unidad de stock: producto y kit usan fltCost; un material, su costo (fltPrice). */
export function stockUnitCost(line: Pick<ResolvedStockLine, 'itemType' | 'entity'>): number {
  const e = line.entity || {};
  return line.itemType === 'material' || line.itemType === 'material_t' ? num(e.fltPrice) : num(e.fltCost);
}

export function computeSaleProfit(
  lines: Pick<ResolvedStockLine, 'itemType' | 'entity' | 'baseQuantity'>[],
  amounts: { total: unknown; tax?: unknown; deliveryFee?: unknown },
): SaleProfit {
  const revenue = round2(Math.max(0, num(amounts.total) - num(amounts.tax) - num(amounts.deliveryFee)));
  let cost = 0;
  let costIncomplete = false;
  for (const line of lines) {
    const qty = num(line.baseQuantity);
    if (qty <= 0) continue;
    const unit = stockUnitCost(line);
    if (unit <= 0) costIncomplete = true;
    cost += unit * qty;
  }
  cost = round2(cost);
  const profit = round2(revenue - cost);
  return {
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    costIncomplete,
  };
}

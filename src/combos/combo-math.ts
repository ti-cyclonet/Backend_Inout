/**
 * Cálculos puros de combos (sin base de datos), para poder probarlos aislados.
 */

export interface ComponentFacts {
  itemType: 'product' | 'material' | 'material_t';
  quantityMode: 'SALE' | 'STOCK';
  /** Cantidad del componente por cada combo. */
  quantity: number;
  /** Precio normal de venta por unidad de venta (producto o presentación). */
  listPrice: number;
  /** Costo por unidad de STOCK (producto: fltCost; material: fltPrice). */
  stockUnitCost: number;
  /** Material de reventa: unidades de stock por presentación (producto: 1). */
  presentationFactor: number;
  /** Stock disponible (ingQuantity - ingReservedStock) en unidad de stock. */
  availableStock: number;
  /** Producto fabricado bajo pedido: no limita la disponibilidad del combo. */
  madeToOrder?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cantidad del componente en unidad de STOCK por cada combo. */
export function stockQuantityPerCombo(c: Pick<ComponentFacts, 'itemType' | 'quantityMode' | 'quantity' | 'presentationFactor'>): number {
  if (c.itemType === 'product' || c.quantityMode === 'STOCK') return c.quantity;
  return c.quantity * (c.presentationFactor > 0 ? c.presentationFactor : 1);
}

/** Suma de los precios normales de los componentes (lo que costarían por separado). */
export function listPriceTotal(components: ComponentFacts[]): number {
  return round2(components.reduce((sum, c) => sum + (c.quantityMode === 'SALE' ? c.listPrice * c.quantity : 0), 0));
}

/** Costo de un combo: suma del costo de sus componentes. */
export function componentsCost(components: ComponentFacts[]): number {
  return round2(components.reduce((sum, c) => sum + stockQuantityPerCombo(c) * c.stockUnitCost, 0));
}

/**
 * Cuántos combos VIRTUALES se pueden vender con el stock actual: el mínimo
 * entre componentes. Los productos bajo pedido no limitan (se fabrican).
 * Sin componentes que limiten, null (= sin límite de stock).
 */
export function virtualAvailability(components: ComponentFacts[]): number | null {
  let min: number | null = null;
  for (const c of components) {
    if (c.madeToOrder) continue;
    const perCombo = stockQuantityPerCombo(c);
    if (perCombo <= 0) continue;
    const units = Math.max(0, Math.floor((c.availableStock + 1e-9) / perCombo));
    min = min === null ? units : Math.min(min, units);
  }
  return min;
}

/**
 * Reparte el precio cobrado por un combo entre sus componentes, en proporción
 * a su precio normal (si ninguno tiene precio, por partes iguales). Los
 * montos van redondeados a 2 decimales y el último absorbe la diferencia,
 * así la suma da exactamente `total`.
 */
export function prorate(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const shares = weights.map((w) => (sum > 0 ? Math.max(0, w) / sum : 1 / weights.length));
  const out = shares.map((s) => round2(total * s));
  const diff = round2(total - out.reduce((s, v) => s + v, 0));
  out[out.length - 1] = round2(out[out.length - 1] + diff);
  return out;
}

/** Costo promedio ponderado del kit al sumar un lote nuevo. */
export function weightedCost(currentQty: number, currentCost: number, addedQty: number, addedCost: number): number {
  const total = currentQty + addedQty;
  if (total <= 0) return round2(addedCost);
  return round2((Math.max(0, currentQty) * currentCost + addedQty * addedCost) / total);
}

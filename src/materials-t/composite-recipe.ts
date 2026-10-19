import { convertUnits } from '../common/utils/unit-conversion';

/**
 * Receta de un material compuesto: las cantidades de cada componente (en su
 * unidad de DESCARGA) producen `recipeYield` del compuesto (en su unidad de
 * MEDIDA). El rendimiento no es la suma de los componentes: 1 kg de fruta
 * puede rendir 700 g de pulpa, o 500 g de harina 30 porciones.
 */
export interface RecipeComponent {
  componentMaterialId: string;
  /** Cantidad de la receta, en la unidad de descarga del componente. */
  quantity: number;
  /** Datos del componente para convertir y costear. */
  measureUnit?: string;
  dischargeUnit?: string;
  packSize?: number | null;
  /** Costo por unidad de medida (la del stock). */
  unitPrice?: number;
  /** Stock disponible, en su unidad de medida. */
  stock?: number;
  name?: string;
}

export interface ComponentNeed {
  componentMaterialId: string;
  name?: string;
  /** Cantidad a descontar, en la unidad de medida (stock) del componente. */
  quantityInStockUnit: number;
  unitPrice: number;
  stock: number;
  measureUnit?: string;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** Rendimiento válido (> 0) o null si la receta aún no lo tiene (compuestos anteriores). */
export function validYield(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lo que se descuenta de cada componente para producir `quantity` del
 * compuesto: la receta escalada por quantity / rendimiento, convertida a la
 * unidad del stock de cada componente.
 */
export function componentNeeds(components: RecipeComponent[], recipeYield: number, quantity: number): ComponentNeed[] {
  const factor = quantity / recipeYield;
  return components.map((c) => {
    const discharge = c.dischargeUnit || c.measureUnit;
    const perBatch = convertUnits(Number(c.quantity) || 0, discharge, c.measureUnit, c.packSize);
    return {
      componentMaterialId: c.componentMaterialId,
      name: c.name,
      quantityInStockUnit: round(perBatch * factor),
      unitPrice: Number(c.unitPrice) || 0,
      stock: Number(c.stock) || 0,
      measureUnit: c.measureUnit,
    };
  });
}

/**
 * Costo de producir una unidad (de medida) del compuesto con la receta:
 * materiales + mano de obra de una tanda, divididos entre lo que rinde.
 */
export function recipeUnitCost(components: RecipeComponent[], recipeYield: number, laborCost = 0): number {
  const materials = componentNeeds(components, recipeYield, recipeYield)
    .reduce((sum, n) => sum + n.quantityInStockUnit * n.unitPrice, 0);
  return round((materials + Math.max(0, Number(laborCost) || 0)) / recipeYield);
}

/** Componentes sin stock suficiente para la producción. */
export function shortages(needs: ComponentNeed[]): ComponentNeed[] {
  return needs.filter((n) => n.quantityInStockUnit > n.stock + 1e-6);
}

/** Costo promedio ponderado tras sumar una producción al stock existente. */
export function weightedCost(stock: number, cost: number, produced: number, batchUnitCost: number): number {
  const s = Math.max(0, Number(stock) || 0);
  const total = s + produced;
  if (total <= 0) return batchUnitCost;
  return round((s * (Number(cost) || 0) + produced * batchUnitCost) / total);
}

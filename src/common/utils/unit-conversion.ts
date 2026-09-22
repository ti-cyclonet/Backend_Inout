/**
 * Conversión entre unidades de medida del catálogo de InOut (los mismos
 * códigos usados en material-form/product-form: kg, g, mg, lb, oz, l, ml,
 * gal, m, cm, mm, in, ft, m2, m3, units, pcs, box, pack, doz).
 *
 * Se usa para poder comprar un material en su "unidad de medida" (ej. kg)
 * y descargarlo en una receta/composición en una "unidad de descarga"
 * distinta (ej. g) sin descuadrar el stock: la cantidad de la receta se
 * convierte a la unidad de medida del material antes de descontar stock.
 *
 * Cada unidad pertenece a una "familia" (masa, volumen, longitud, área,
 * volumen³, conteo). Solo se puede convertir dentro de la misma familia.
 * "box"/"pack" quedan como familias de un solo elemento porque no hay un
 * factor fijo conocido (una caja no siempre trae la misma cantidad) — así
 * que solo son compatibles consigo mismas.
 */

const FAMILY_UNITS: Record<string, string[]> = {
  mass: ['mg', 'g', 'kg', 'lb', 'oz'],
  volume: ['ml', 'l', 'gal'],
  length: ['mm', 'cm', 'm', 'in', 'ft'],
  area: ['m2'],
  volume3: ['m3'],
  count: ['units', 'pcs', 'doz'],
  box: ['box'],
  pack: ['pack'],
};

// Factor para convertir 1 unidad a la unidad base de su familia
// (gramo, mililitro, milímetro, m², m³, unidad).
const FACTOR_TO_BASE: Record<string, number> = {
  mg: 0.001, g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125,
  ml: 1, l: 1000, gal: 3785.411784,
  mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8,
  m2: 1,
  m3: 1,
  units: 1, pcs: 1, doz: 12,
  box: 1, pack: 1,
};

function familyOf(unit: string): string | null {
  const key = (unit || '').trim();
  for (const [family, units] of Object.entries(FAMILY_UNITS)) {
    if (units.includes(key)) return family;
  }
  return null;
}

/**
 * ¿Se puede convertir entre estas dos unidades? true también si alguna está
 * vacía/es desconocida (no bloquea configuraciones antiguas sin unidad).
 */
export function areUnitsCompatible(unitA?: string, unitB?: string): boolean {
  if (!unitA || !unitB || unitA === unitB) return true;
  const famA = familyOf(unitA);
  const famB = familyOf(unitB);
  if (!famA || !famB) return true; // unidad no catalogada: no bloquear
  return famA === famB;
}

/**
 * Convierte `value` de `fromUnit` a `toUnit`. Si alguna unidad falta o no
 * está catalogada, retorna `value` sin cambios (comportamiento legado). Si
 * ambas están catalogadas pero son de familias distintas, lanza error: es
 * una configuración inválida (ej. medir en "kg" y descargar en "units").
 */
export function convertUnits(value: number, fromUnit?: string, toUnit?: string): number {
  if (value == null || Number.isNaN(value)) return value;
  if (!fromUnit || !toUnit || fromUnit === toUnit) return value;

  const factorFrom = FACTOR_TO_BASE[fromUnit];
  const factorTo = FACTOR_TO_BASE[toUnit];
  if (factorFrom === undefined || factorTo === undefined) return value;

  if (familyOf(fromUnit) !== familyOf(toUnit)) {
    throw new Error(
      `No se puede convertir de "${fromUnit}" a "${toUnit}": son unidades de tipos distintos (ej. masa vs. volumen).`,
    );
  }

  return (value * factorFrom) / factorTo;
}

/**
 * Presentaciones de venta de un producto (8 oz, 12 oz, 20 oz…). Cada una es un
 * producto con su receta, precio y stock; la familia las agrupa para que el
 * MarketPlace las muestre como un solo producto con selector de presentación.
 */

/** Nombre de presentación limpio: sin espacios de más, máximo 40 caracteres. */
export function cleanLabel(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

const endsWithLabel = (name: string, label: string) =>
  !!label && name.trim().toLowerCase().endsWith(label.trim().toLowerCase());

/** El nombre con la presentación al final ("FRESAS CON CREMA" + "8 oz" -> "FRESAS CON CREMA 8 oz"). */
export function nameWithLabel(name: string, label: string): string {
  const base = name.replace(/\s+/g, ' ').trim();
  return endsWithLabel(base, label) ? base : `${base} ${label}`.trim();
}

/**
 * Nombre de la presentación nueva a partir del producto de origen: cambia la
 * presentación del final ("FRESAS CON CREMA 8 OZ" -> "FRESAS CON CREMA 12 OZ")
 * o la agrega si el nombre no la tenía.
 */
export function presentationName(sourceName: string, sourceLabel: string | null | undefined, label: string): string {
  const base = sourceName.replace(/\s+/g, ' ').trim();
  if (sourceLabel && endsWithLabel(base, sourceLabel)) {
    return `${base.slice(0, base.length - sourceLabel.trim().length).trim()} ${label}`.trim();
  }
  return `${base} ${label}`.trim();
}

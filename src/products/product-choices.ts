import { BadRequestException } from '@nestjs/common';

/**
 * Productos "para armar": el cliente escoge en la tienda opciones de las
 * listas de la carta (bloques de menuExtras: "Proteínas", "Salsas"…). Ej. una
 * arepa combinada con 2 proteínas a elegir. El producto guarda los grupos
 * (jsonChoiceGroups) y cada línea del pedido lo elegido (choices). Una opción
 * con precio en la carta ("Queso extra" $3.000) suma al precio de la unidad.
 * Funciones puras (product-choices.spec.ts).
 */

export interface ChoiceGroup {
  /** Título del bloque de la carta (menuExtras.blocks[].title). */
  block: string;
  /** Mínimo a escoger (0 = opcional). */
  min: number;
  /** Máximo a escoger. */
  max: number;
}

/** Lo escogido en una línea del pedido. */
export interface LineChoice {
  group: string;
  options: string[];
  /** Valor adicional de cada opción (mismo orden); solo si alguna cuesta. */
  prices?: number[];
}

export const CHOICE_LIMITS = { groups: 4, max: 10, block: 40 };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);
const key = (s: string) => s.trim().toLowerCase();

/** Normaliza los grupos de un producto (lo que se guarda); lanza si no tienen sentido. */
export function resolveChoiceGroups(raw: unknown): ChoiceGroup[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new BadRequestException('Las opciones del producto no son válidas.');
  const seen = new Set<string>();
  const groups: ChoiceGroup[] = [];
  for (const g of raw) {
    const block = text(g?.block, CHOICE_LIMITS.block);
    if (!block) continue;
    if (seen.has(key(block))) throw new BadRequestException(`La lista "${block}" está repetida en las opciones del producto.`);
    const min = int(g?.min);
    const max = int(g?.max);
    if (!Number.isFinite(max) || max < 1 || max > CHOICE_LIMITS.max) {
      throw new BadRequestException(`En "${block}" el máximo a escoger debe estar entre 1 y ${CHOICE_LIMITS.max}.`);
    }
    if (!Number.isFinite(min) || min < 0 || min > max) {
      throw new BadRequestException(`En "${block}" el mínimo a escoger debe estar entre 0 y ${max}.`);
    }
    seen.add(key(block));
    groups.push({ block, min, max });
  }
  if (groups.length > CHOICE_LIMITS.groups) {
    throw new BadRequestException(`Un producto admite máximo ${CHOICE_LIMITS.groups} listas de opciones.`);
  }
  return groups;
}

/** "elige 2", "elige de 1 a 3", "hasta 2". */
const howMany = (g: ChoiceGroup) =>
  g.min === g.max ? `${g.min}` : g.min === 0 ? `hasta ${g.max}` : `de ${g.min} a ${g.max}`;

/**
 * Valida lo que escogió el cliente para una línea contra los grupos del
 * producto y las listas vigentes de la carta. Devuelve lo escogido con los
 * nombres de la carta. Un grupo cuya lista ya no existe en la carta se ignora
 * (la tienda la borró o renombró: no se bloquea la venta).
 */
export function validateLineChoices(
  productName: string,
  groups: ChoiceGroup[] | null | undefined,
  blocks: { title: string; items: { name: string; price?: number }[] }[],
  raw: unknown,
): LineChoice[] {
  const sent = Array.isArray(raw) ? raw : [];
  const result: LineChoice[] = [];
  for (const g of groups || []) {
    const block = blocks.find((b) => key(b.title) === key(g.block));
    if (!block || !block.items.length) continue;
    const entry = sent.find((c: any) => typeof c?.group === 'string' && key(c.group) === key(block.title));
    const picked: string[] = [];
    const prices: number[] = [];
    for (const o of Array.isArray(entry?.options) ? entry.options : []) {
      const item = typeof o === 'string' ? block.items.find((i) => key(i.name) === key(o)) : undefined;
      if (!item) throw new BadRequestException(`"${String(o)}" no es una opción de ${block.title} para ${productName}.`);
      if (picked.includes(item.name)) continue;
      picked.push(item.name);
      prices.push(Math.max(0, Math.round(Number(item.price) || 0)));
    }
    const max = Math.min(g.max, block.items.length);
    const min = Math.min(g.min, max);
    if (picked.length < min || picked.length > max) {
      throw new BadRequestException(`${productName}: elige ${howMany({ ...g, min, max })} de ${block.title}.`);
    }
    if (picked.length) result.push({ group: block.title, options: picked, ...(prices.some((p) => p > 0) ? { prices } : {}) });
  }
  return result;
}

/** Lo que suman las opciones escogidas a cada unidad. */
export function choicesExtra(choices: unknown): number {
  if (!Array.isArray(choices)) return 0;
  return choices.reduce(
    (sum: number, c: any) => sum + (Array.isArray(c?.prices) ? c.prices.reduce((s: number, p: any) => s + (Number(p) > 0 ? Number(p) : 0), 0) : 0),
    0,
  );
}

/** $3.000 (pesos, sin decimales). */
const pesos = (n: number) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/** Para mostrar: ["Proteínas: Pollo, Cerdo", "Adiciones: Queso (+$3.000)"]. */
export function choicesText(choices: unknown): string[] {
  if (!Array.isArray(choices)) return [];
  return choices
    .filter((c: any) => c && typeof c.group === 'string' && Array.isArray(c.options) && c.options.length)
    .map((c: any) => {
      const opts = c.options.map((o: string, i: number) => {
        const p = Array.isArray(c.prices) ? Number(c.prices[i]) : 0;
        return p > 0 ? `${o} (+${pesos(p)})` : o;
      });
      return `${c.group}: ${opts.join(', ')}`;
    });
}

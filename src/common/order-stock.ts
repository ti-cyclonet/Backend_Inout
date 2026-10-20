import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { applyStockDelta, assertStockAvailable, resolveStockLines, ResolvedStockLine, StockLine } from './stock-availability';
import { ComboComponent } from '../combos/entities/combo-component.entity';
import { loadComponents } from '../combos/combo-components';
import { kitMadeToOrder } from '../combos/combo-math';
import { batchLeadHours, orderLeadHours, productLeadHours } from './lead-time';

/**
 * Stock de pedidos con FABRICACIÓN BAJO PEDIDO.
 *
 * Un producto marcado `blnMadeToOrder` se puede pedir aunque no haya stock:
 * se reserva lo disponible y el faltante queda "por fabricar". El negocio lo
 * fabrica con un lote normal (products/production, que suma al stock) y, al
 * pasar el pedido a READY, se reserva el resto. Un material compuesto de
 * reventa con la marca también se puede pedir sin stock: se produce con su
 * receta (materials-t/:id/produce). Los materiales de reventa simples y lo
 * que no tiene la marca siguen exigiendo stock completo, como antes.
 *
 * Un KIT armado cuyos componentes son TODOS productos bajo pedido también se
 * puede pedir sin armados: el faltante queda por fabricar (se producen los
 * componentes y se arma el kit antes de pasarlo a Listo).
 *
 * TIEMPO: se fabrica por TANDAS. Una tanda toma el tiempo de fabricación del
 * ítem y rinde: en productos intUnitsPerBatch (1 por defecto), en compuestos
 * lo que rinde su receta (fltRecipeYield). Por ítem, tandas = faltante ÷
 * rendimiento (hacia arriba) y el tiempo del pedido es la SUMA de todos los
 * ítems por fabricar: en un negocio pequeño los prepara la misma persona.
 * Un kit cuenta como una sola tanda (el mayor tiempo de sus componentes).
 * TODO: varias personas en un turno (preparan en paralelo): repartir las
 * tandas entre ellas en vez de sumarlas todas.
 *
 * Cada línea guarda `reservedQuantity` y `toManufacture` (en la misma unidad
 * en que se vende). Pedidos anteriores no traen esos campos: se consideran
 * totalmente reservados, que es lo que hacía el flujo anterior.
 */
export interface OrderStockItem extends StockLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  itemType?: string;
  reservedQuantity?: number;
  toManufacture?: number;
}

export interface ReservationResult<T extends OrderStockItem> {
  items: T[];
  /** Hay al menos una línea con unidades por fabricar. */
  hasMadeToOrder: boolean;
  /** Tiempo de fabricación (horas): suma de las tandas de todo lo que falta. */
  leadHours: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

type MadeToOrder = { madeToOrder: boolean; leadHours: number; unitsPerBatch?: number };

/**
 * ¿La línea se puede fabricar si falta stock? Cuántas horas toma una tanda y
 * cuánto rinde (en la unidad de stock del ítem, la de baseQuantity).
 */
async function madeToOrderOf(
  manager: EntityManager,
  tenantId: string,
  line: ResolvedStockLine,
  kitCache: Map<string, MadeToOrder>,
): Promise<MadeToOrder> {
  // Productos y materiales compuestos de reventa con la marca de bajo pedido
  if (line.itemType === 'product') {
    return {
      madeToOrder: !!line.entity.blnMadeToOrder,
      leadHours: productLeadHours(line.entity),
      unitsPerBatch: Math.max(1, Number(line.entity.intUnitsPerBatch) || 1),
    };
  }
  if (line.itemType === 'material_t') {
    // La tanda es la receta (en la unidad de medida del compuesto); sin
    // rendimiento definido, una presentación por tanda.
    const recipeYield = Number(line.entity.fltRecipeYield) || 0;
    const factor = line.quantity > 0 ? line.baseQuantity / line.quantity : 1;
    return {
      madeToOrder: !!line.entity.blnMadeToOrder,
      leadHours: productLeadHours(line.entity),
      unitsPerBatch: recipeYield > 0 ? recipeYield : factor || 1,
    };
  }
  if (line.itemType !== 'kit') return { madeToOrder: false, leadHours: 0 };
  let kit = kitCache.get(line.id);
  if (!kit) {
    const components = await manager.find(ComboComponent, { where: { strComboId: line.id } });
    const loaded = await loadComponents(manager, tenantId, components).catch(() => []);
    kit = kitMadeToOrder(loaded.map((l) => l.facts));
    kitCache.set(line.id, kit);
  }
  return kit;
}

/** Suma de las tandas de cada ítem por fabricar (ver TIEMPO arriba). */
function pendingLeadHours(pending: Map<string, { toMake: number; mto: MadeToOrder }>): number {
  let total = 0;
  for (const { toMake, mto } of pending.values()) {
    total += batchLeadHours(mto.leadHours, toMake, mto.unitsPerBatch ?? Infinity);
  }
  return Math.round(total * 1000) / 1000;
}

/** Cantidad reservada de una línea (compatibilidad: sin el campo = todo reservado). */
export function reservedOf(item: OrderStockItem): number {
  return item.reservedQuantity === undefined || item.reservedQuantity === null
    ? Number(item.quantity) || 0
    : Number(item.reservedQuantity) || 0;
}

export function toManufactureOf(item: OrderStockItem): number {
  return Math.max(0, Number(item.toManufacture) || 0);
}

/**
 * Material compuesto de reventa (pulpa, tajadas…): aunque salga del stock se
 * prepara para el pedido, así que pasa por En producción.
 */
export function isPreparedItem(item: { itemType?: string } | null | undefined): boolean {
  return item?.itemType === 'material_t';
}

/** Alguna línea se fabrica (bajo pedido, sin stock) o se prepara (material compuesto). */
export function itemsNeedProduction(items: { itemType?: string; toManufacture?: number }[] | null | undefined): boolean {
  return (items || []).some((i) => toManufactureOf(i as OrderStockItem) > 0 || isPreparedItem(i));
}

/**
 * El pedido pasa por producción si algo de él se fabrica (bajo pedido, sin
 * stock) o se prepara (material compuesto de reventa). Lo demás que ya está en
 * stock —material de reventa simple, producto ya fabricado, combo o kit armado
 * con stock— solo se alista: va de Confirmado a Listo sin la etapa En
 * producción ni la cola de producción.
 */
export function orderNeedsProduction(order: { items?: OrderStockItem[] | null; productionLeadHours?: number | string | null; productionLeadMinutes?: number | string | null }): boolean {
  return itemsNeedProduction(order.items) || orderLeadHours(order) > 0;
}

/** Líneas con la cantidad RESERVADA (para liberar la reserva o descontarla). */
export function reservedLines(items: OrderStockItem[]): StockLine[] {
  return (items || [])
    .map((i) => ({ ...i, quantity: reservedOf(i) }))
    .filter((i) => i.quantity > 0);
}

/**
 * Reserva el stock de un pedido nuevo o que se confirma. Debe llamarse dentro
 * de una transacción (bloquea las filas). Lanza 400 listando lo que no se
 * puede cubrir ni fabricar.
 */
export async function reserveOrderStock<T extends OrderStockItem>(
  manager: EntityManager,
  tenantId: string,
  items: T[],
): Promise<ReservationResult<T>> {
  const resolved = await resolveStockLines(manager, tenantId, items, { lock: true, requireResale: true });

  // Disponible por ítem (el mismo puede venir en varias líneas)
  const available = new Map<string, number>();
  for (const line of resolved) {
    const key = `${line.itemType}:${line.id}`;
    if (!available.has(key)) {
      available.set(key, Number(line.entity.ingQuantity || 0) - Number(line.entity.ingReservedStock || 0));
    }
  }

  const shortages: string[] = [];
  const toReserve: ResolvedStockLine[] = [];
  const kitCache = new Map<string, MadeToOrder>();
  let hasMadeToOrder = false;
  // Por ítem: lo que falta (unidad de stock) y su tanda, para sumar el tiempo
  const pending = new Map<string, { toMake: number; mto: MadeToOrder }>();

  // resolveStockLines conserva el orden y omite líneas sin productId
  const annotated = items.map((item) => ({ ...item }));
  let r = 0;
  for (const item of annotated) {
    if (!item?.productId) continue;
    // Los bonos no tienen stock: resolveStockLines también los omite
    if ((item as any).itemType === 'gift_card') continue;
    const line = resolved[r++];
    const key = `${line.itemType}:${line.id}`;
    const factor = line.quantity > 0 ? line.baseQuantity / line.quantity : 1;
    const availBase = Math.max(0, available.get(key) || 0);
    const availUnits = factor > 0 ? availBase / factor : 0;

    let reserved = line.quantity;
    if (availUnits < line.quantity) {
      const mto = await madeToOrderOf(manager, tenantId, line, kitCache);
      if (!mto.madeToOrder) {
        shortages.push(`"${line.name}" (disponible: ${Math.floor(availUnits)}, solicitado: ${line.quantity})`);
        continue;
      }
      reserved = round(Math.max(0, availUnits));
      hasMadeToOrder = true;
      const prev = pending.get(key);
      pending.set(key, { toMake: (prev?.toMake || 0) + (line.quantity - reserved) * factor, mto });
    }

    item.reservedQuantity = reserved;
    item.toManufacture = round(line.quantity - reserved);
    available.set(key, availBase - reserved * factor);
    if (reserved > 0) toReserve.push({ ...line, quantity: reserved, baseQuantity: reserved * factor });
  }

  if (shortages.length > 0) {
    throw new BadRequestException(`Stock insuficiente: ${shortages.join('; ')}`);
  }

  await applyStockDelta(manager, tenantId, toReserve, { reserved: 1 });
  return { items: annotated, hasMadeToOrder, leadHours: pendingLeadHours(pending) };
}

/**
 * Vista previa sin bloquear ni reservar: qué habría que fabricar y cuánto
 * tarda. Sirve para ofrecer franjas antes de crear el pedido; la validación
 * real ocurre al crearlo (reserveOrderStock).
 */
export async function previewOrderStock(
  manager: EntityManager,
  tenantId: string,
  items: StockLine[],
): Promise<{ hasMadeToOrder: boolean; leadHours: number }> {
  const resolved = await resolveStockLines(manager, tenantId, items, { skipMissing: true });
  const used = new Map<string, number>();
  const kitCache = new Map<string, MadeToOrder>();
  const pending = new Map<string, { toMake: number; mto: MadeToOrder }>();
  let hasMadeToOrder = false;
  for (const line of resolved) {
    const key = `${line.itemType}:${line.id}`;
    const available = Number(line.entity.ingQuantity || 0) - Number(line.entity.ingReservedStock || 0) - (used.get(key) || 0);
    used.set(key, (used.get(key) || 0) + line.baseQuantity);
    if (available < line.baseQuantity) {
      const mto = await madeToOrderOf(manager, tenantId, line, kitCache);
      if (mto.madeToOrder) {
        hasMadeToOrder = true;
        const missing = line.baseQuantity - Math.max(0, available);
        pending.set(key, { toMake: (pending.get(key)?.toMake || 0) + missing, mto });
      }
    }
  }
  return { hasMadeToOrder, leadHours: pendingLeadHours(pending) };
}

/**
 * Al pasar a READY: lo que estaba por fabricar ya debe estar en stock (el lote
 * de producción lo sumó). Se reserva y la línea queda completa.
 */
export async function reserveManufactured<T extends OrderStockItem>(
  manager: EntityManager,
  tenantId: string,
  items: T[],
): Promise<T[]> {
  const pending = (items || [])
    .filter((i) => toManufactureOf(i) > 0)
    .map((i) => ({ ...i, quantity: toManufactureOf(i) }));
  if (pending.length === 0) return items;

  let resolved: ResolvedStockLine[];
  try {
    resolved = await assertStockAvailable(manager, tenantId, pending);
  } catch (err) {
    if (err instanceof BadRequestException) {
      throw new BadRequestException(
        `Faltan unidades por fabricar para marcar el pedido como listo. ${(err as Error).message}. Registra la producción primero (y, si es un kit, ármalo en Combos y kits).`,
      );
    }
    throw err;
  }
  await applyStockDelta(manager, tenantId, resolved, { reserved: 1 });

  return items.map((i) => (toManufactureOf(i) > 0 ? { ...i, reservedQuantity: Number(i.quantity) || 0, toManufacture: 0 } : i));
}

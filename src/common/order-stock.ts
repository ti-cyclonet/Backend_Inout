import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { applyStockDelta, assertStockAvailable, resolveStockLines, ResolvedStockLine, StockLine } from './stock-availability';

/**
 * Stock de pedidos con FABRICACIÓN BAJO PEDIDO.
 *
 * Un producto marcado `blnMadeToOrder` se puede pedir aunque no haya stock:
 * se reserva lo disponible y el faltante queda "por fabricar". El negocio lo
 * fabrica con un lote normal (products/production, que suma al stock) y, al
 * pasar el pedido a READY, se reserva el resto. Materiales de reventa y
 * productos sin la marca siguen exigiendo stock completo, como antes.
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
  /** Mayor tiempo de fabricación (horas) entre las líneas por fabricar. */
  maxLeadHours: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Cantidad reservada de una línea (compatibilidad: sin el campo = todo reservado). */
export function reservedOf(item: OrderStockItem): number {
  return item.reservedQuantity === undefined || item.reservedQuantity === null
    ? Number(item.quantity) || 0
    : Number(item.reservedQuantity) || 0;
}

export function toManufactureOf(item: OrderStockItem): number {
  return Math.max(0, Number(item.toManufacture) || 0);
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
  let hasMadeToOrder = false;
  let maxLeadHours = 0;

  // resolveStockLines conserva el orden y omite líneas sin productId
  const annotated = items.map((item) => ({ ...item }));
  let r = 0;
  for (const item of annotated) {
    if (!item?.productId) continue;
    const line = resolved[r++];
    const key = `${line.itemType}:${line.id}`;
    const factor = line.quantity > 0 ? line.baseQuantity / line.quantity : 1;
    const availBase = Math.max(0, available.get(key) || 0);
    const availUnits = factor > 0 ? availBase / factor : 0;

    let reserved = line.quantity;
    if (availUnits < line.quantity) {
      const madeToOrder = line.itemType === 'product' && !!line.entity.blnMadeToOrder;
      if (!madeToOrder) {
        shortages.push(`"${line.name}" (disponible: ${Math.floor(availUnits)}, solicitado: ${line.quantity})`);
        continue;
      }
      reserved = round(Math.max(0, availUnits));
      hasMadeToOrder = true;
      maxLeadHours = Math.max(maxLeadHours, Number(line.entity.intProductionLeadHours) || 0);
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
  return { items: annotated, hasMadeToOrder, maxLeadHours };
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
        `Faltan unidades por fabricar para marcar el pedido como listo. ${(err as Error).message}. Registra la producción primero.`,
      );
    }
    throw err;
  }
  await applyStockDelta(manager, tenantId, resolved, { reserved: 1 });

  return items.map((i) => (toManufactureOf(i) > 0 ? { ...i, reservedQuantity: Number(i.quantity) || 0, toManufacture: 0 } : i));
}

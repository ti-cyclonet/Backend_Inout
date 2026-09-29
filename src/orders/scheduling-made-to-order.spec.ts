import { BadRequestException } from '@nestjs/common';
import { previewOrderStock, reserveOrderStock } from '../common/order-stock';
import { OrderStatus } from './entities/order.entity';
import { estimateQueue, QueueOrder, resolveTimingSettings } from './order-timing';
import { assertSlotAvailable, bogotaToUtc, buildSlots, resolveScheduling } from './scheduling';

/**
 * Escenario completo: programar un pedido del MarketPlace cuando NO hay stock
 * del producto. Reproduce lo que hace OrdersService (getMarketplaceSlots y
 * saveMarketplaceOrder) con las mismas funciones, sin base de datos.
 */

// Lunes 28/09/2026 10:00 en Colombia
const now = new Date('2026-09-28T15:00:00Z');
const scheduling = resolveScheduling({
  enabled: true, slotMinutes: 60, minLeadHours: 2, maxDaysAhead: 7,
  hours: [1, 2, 3, 4, 5, 6].map((day) => ({ day, active: true, open: '08:00', close: '18:00' })),
});
const timing = resolveTimingSettings({ stageDurations: { IN_PRODUCTION: 60 }, productionCapacity: 1 });

function fakeManager(rows: Record<string, any>) {
  return {
    findOne: async (_e: any, opts: any) => rows[opts.where.strId] || null,
    query: async () => undefined,
  } as any;
}

/** Igual que estimateReadyForNewOrder: el pedido nuevo entra al final de la cola. */
function earliestReady(queue: QueueOrder[], leadHours: number): Date | null {
  const probe: QueueOrder = { id: 'new', status: OrderStatus.CONFIRMED, stageEnteredAt: now, createdAt: now, leadHours };
  const est = estimateQueue([...queue, probe], timing, now).find((e) => e.id === 'new')!;
  return est.estimatedReadyAt.getTime() > now.getTime() ? est.estimatedReadyAt : null;
}

const cart = (productId: string, quantity: number) => [
  { productId, productName: productId, quantity, unitPrice: 1000, subtotal: 1000 * quantity, itemType: 'product' },
];

describe('programar un pedido sin stock', () => {
  const rows = {
    torta: { strId: 'torta', strName: 'Torta', ingQuantity: 0, ingReservedStock: 0, blnMadeToOrder: true, intProductionLeadHours: 24 },
    silla: { strId: 'silla', strName: 'Silla', ingQuantity: 0, ingReservedStock: 0 },
  };

  it('producto bajo pedido: solo ofrece franjas desde que se termine de fabricar', async () => {
    const preview = await previewOrderStock(fakeManager(rows), 't1', cart('torta', 1));
    expect(preview).toEqual({ hasMadeToOrder: true, maxLeadHours: 24 });

    const ready = earliestReady([], preview.maxLeadHours);
    expect(ready!.toISOString()).toBe('2026-09-29T15:00:00.000Z'); // mañana 10:00

    const today = buildSlots('2026-09-28', scheduling, { now, earliestReadyAt: ready });
    expect(today.filter((s) => s.available)).toHaveLength(0);
    expect(today.some((s) => s.reason === 'PREPARACION')).toBe(true);

    const tomorrow = buildSlots('2026-09-29', scheduling, { now, earliestReadyAt: ready });
    expect(tomorrow.filter((s) => s.available).map((s) => s.start.toISOString())[0])
      .toBe(bogotaToUtc('2026-09-29', 10 * 60).toISOString());
  });

  it('al crear el pedido: nada reservado, todo por fabricar y la franja se valida igual', async () => {
    const stock = await reserveOrderStock(fakeManager(rows), 't1', cart('torta', 2));
    expect(stock.items[0]).toMatchObject({ reservedQuantity: 0, toManufacture: 2 });
    const ready = earliestReady([], stock.maxLeadHours);

    expect(() => assertSlotAvailable(bogotaToUtc('2026-09-28', 15 * 60), scheduling, { now, earliestReadyAt: ready }))
      .toThrow(/no alcanza/);
    expect(assertSlotAvailable(bogotaToUtc('2026-09-29', 14 * 60), scheduling, { now, earliestReadyAt: ready }).start)
      .toEqual(bogotaToUtc('2026-09-29', 14 * 60));
  });

  it('la cola retrasa la primera franja: otro pedido en producción ocupa el único cupo', async () => {
    const enProduccion: QueueOrder = {
      id: 'p1', status: OrderStatus.IN_PRODUCTION, createdAt: now, stageEnteredAt: now, leadHours: 5,
    }; // termina a las 15:00
    const ready = earliestReady([enProduccion], 24);
    // Empieza cuando se libera el cupo (hoy 15:00) y tarda 24 h: mañana 15:00
    expect(ready!.toISOString()).toBe('2026-09-29T20:00:00.000Z');
    const tomorrow = buildSlots('2026-09-29', scheduling, { now, earliestReadyAt: ready });
    expect(tomorrow.filter((s) => s.available).map((s) => s.start)).toEqual([
      bogotaToUtc('2026-09-29', 15 * 60), bogotaToUtc('2026-09-29', 16 * 60), bogotaToUtc('2026-09-29', 17 * 60),
    ]);
  });

  it('producto normal sin stock: no se puede pedir (ni programado)', async () => {
    await expect(reserveOrderStock(fakeManager(rows), 't1', cart('silla', 1))).rejects.toThrow(BadRequestException);
  });

  it('bajo pedido SIN tiempo de fabricación: no hay restricción de preparación (solo la anticipación mínima)', async () => {
    const sinTiempo = { torta: { ...rows.torta, intProductionLeadHours: null } };
    const preview = await previewOrderStock(fakeManager(sinTiempo), 't1', cart('torta', 1));
    const ready = earliestReady([], preview.maxLeadHours);
    // Solo cuenta la etapa de producción configurada (60 min): 11:00 hoy
    expect(ready!.toISOString()).toBe('2026-09-28T16:00:00.000Z');
    const slots = buildSlots('2026-09-28', scheduling, { now, earliestReadyAt: ready });
    expect(slots.find((s) => s.available)!.start).toEqual(bogotaToUtc('2026-09-28', 12 * 60));
  });
});

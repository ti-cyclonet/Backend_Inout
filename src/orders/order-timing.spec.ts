import { OrderStatus } from './entities/order.entity';
import { estimateQueue, QueueOrder, resolveTimingSettings, stageDueAt } from './order-timing';

const now = new Date('2026-09-28T15:00:00Z');
const at = (min: number) => new Date(now.getTime() + min * 60000);
const iso = (d: Date) => d.toISOString();
const order = (id: string, status: OrderStatus, enteredMinAgo: number, leadHours = 0): QueueOrder => ({
  id, status, stageEnteredAt: at(-enteredMinAgo), createdAt: at(-enteredMinAgo), leadHours,
});

describe('resolveTimingSettings', () => {
  it('ignora duraciones vacías o inválidas y acota la capacidad', () => {
    const s = resolveTimingSettings({ stageDurations: { CONFIRMED: 30, READY: 0, DRAFT: -5, IN_PRODUCTION: '' as any }, productionCapacity: 0 });
    expect(s.stageDurations).toEqual({ CONFIRMED: 30 });
    expect(s.productionCapacity).toBe(1);
  });
});

describe('stageDueAt', () => {
  const s = resolveTimingSettings({ stageDurations: { CONFIRMED: 30, IN_PRODUCTION: 60 } });

  it('suma la duración de la etapa', () => {
    expect(iso(stageDueAt(s, OrderStatus.CONFIRMED, now)!)).toBe(iso(at(30)));
  });

  it('en producción usa la fabricación si es mayor que la etapa', () => {
    expect(iso(stageDueAt(s, OrderStatus.IN_PRODUCTION, now, 3)!)).toBe(iso(at(180)));
    expect(iso(stageDueAt(s, OrderStatus.IN_PRODUCTION, now, 0.5)!)).toBe(iso(at(60)));
  });

  it('sin duración configurada no hay vencimiento', () => {
    expect(stageDueAt(s, OrderStatus.READY, now)).toBeNull();
  });
});

describe('estimateQueue', () => {
  const s = resolveTimingSettings({ stageDurations: { IN_PRODUCTION: 60 }, productionCapacity: 1 });

  it('con un cupo, cada pedido en espera empieza cuando termina el anterior', () => {
    const q = estimateQueue([
      order('prod', OrderStatus.IN_PRODUCTION, 20),   // termina en 40 min
      order('a', OrderStatus.CONFIRMED, 15),
      order('b', OrderStatus.CONFIRMED, 5),
    ], s, now);
    const byId = Object.fromEntries(q.map((e) => [e.id, e]));
    expect(iso(byId.prod.estimatedReadyAt)).toBe(iso(at(40)));
    expect(byId.a).toMatchObject({ queuePosition: 1, waitMinutes: 40 });
    expect(iso(byId.a.estimatedReadyAt)).toBe(iso(at(100)));
    expect(byId.b).toMatchObject({ queuePosition: 2, waitMinutes: 100 });
    expect(iso(byId.b.estimatedReadyAt)).toBe(iso(at(160)));
  });

  it('con dos cupos los pedidos se reparten', () => {
    const q = estimateQueue([
      order('a', OrderStatus.CONFIRMED, 30),
      order('b', OrderStatus.CONFIRMED, 20),
      order('c', OrderStatus.CONFIRMED, 10),
    ], { ...s, productionCapacity: 2 }, now);
    const byId = Object.fromEntries(q.map((e) => [e.id, e]));
    expect(byId.a.waitMinutes).toBe(0);
    expect(byId.b.waitMinutes).toBe(0);
    expect(byId.c.waitMinutes).toBe(60);
  });

  it('el tiempo de fabricación del pedido alarga su producción y la espera de los siguientes', () => {
    const q = estimateQueue([
      order('mesa', OrderStatus.CONFIRMED, 10, 4),
      order('b', OrderStatus.CONFIRMED, 5),
    ], s, now);
    const byId = Object.fromEntries(q.map((e) => [e.id, e]));
    expect(iso(byId.mesa.estimatedReadyAt)).toBe(iso(at(240)));
    expect(byId.b.waitMinutes).toBe(240);
  });

  it('un pedido en producción atrasado se asume terminando ahora', () => {
    const q = estimateQueue([order('tarde', OrderStatus.IN_PRODUCTION, 90), order('a', OrderStatus.CONFIRMED, 5)], s, now);
    const byId = Object.fromEntries(q.map((e) => [e.id, e]));
    expect(iso(byId.tarde.estimatedReadyAt)).toBe(iso(now));
    expect(byId.a.waitMinutes).toBe(0);
  });

  it('con más pedidos en producción que cupos, espera a que se libere un cupo real', () => {
    const q = estimateQueue([
      order('p1', OrderStatus.IN_PRODUCTION, 50), // termina en 10
      order('p2', OrderStatus.IN_PRODUCTION, 20), // termina en 40
      order('a', OrderStatus.CONFIRMED, 5),
    ], s, now);
    expect(q.find((e) => e.id === 'a')!.waitMinutes).toBe(40);
  });

  it('un pedido programado entra a producción justo a tiempo y no retrasa a los demás', () => {
    const programado: QueueOrder = { ...order('prog', OrderStatus.CONFIRMED, 30), scheduledStart: at(300) };
    const q = estimateQueue([programado, order('ya', OrderStatus.CONFIRMED, 5)], s, now);
    const byId = Object.fromEntries(q.map((e) => [e.id, e]));
    expect(byId.ya).toMatchObject({ queuePosition: 1, waitMinutes: 0 });
    expect(iso(byId.prog.estimatedStartAt)).toBe(iso(at(240)));
    expect(iso(byId.prog.estimatedReadyAt)).toBe(iso(at(300)));
  });

  it('sin tiempos configurados la cola no suma espera', () => {
    const q = estimateQueue([order('a', OrderStatus.CONFIRMED, 5), order('b', OrderStatus.CONFIRMED, 1)], resolveTimingSettings(null), now);
    expect(q.every((e) => e.waitMinutes === 0)).toBe(true);
  });
});

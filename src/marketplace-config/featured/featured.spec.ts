import { addDays, invoiceConcept, nextFreeStart, peakUsage, resolveFeaturedSettings } from './featured';
import { FeaturedService } from './featured.service';
import { FeaturedStatus } from './market-featured.entity';

const d = (s: string) => new Date(s + 'T12:00:00Z');
const booking = (from: string, days: number) => ({ startsAt: d(from), endsAt: addDays(d(from), days) });

describe('destacados: cupos y fechas', () => {
  it('ajustes: sin precios queda apagado y los cupos tienen límite', () => {
    expect(resolveFeaturedSettings(null)).toEqual({ priceWeek: 0, priceMonth: 0, slots: 6 });
    expect(resolveFeaturedSettings({ priceWeek: '25000', priceMonth: 80000.4, slots: 200 })).toEqual({ priceWeek: 25000, priceMonth: 80000, slots: 50 });
  });

  it('máximo de reservas a la vez en un rango', () => {
    const b = [booking('2026-10-01', 7), booking('2026-10-05', 7), booking('2026-10-20', 7)];
    expect(peakUsage(b, d('2026-10-01').getTime(), d('2026-10-30').getTime())).toBe(2);
    expect(peakUsage(b, d('2026-10-13').getTime(), d('2026-10-19').getTime())).toBe(0);
  });

  it('con cupo libre empieza hoy; lleno, cuando se libera uno', () => {
    const now = d('2026-10-21');
    expect(nextFreeStart([booking('2026-10-20', 7)], 2, 7, now)).toEqual(now);
    // 2 cupos ocupados: uno termina el 27 y otro el 18/11
    const full = [booking('2026-10-20', 7), booking('2026-10-19', 30)];
    expect(nextFreeStart(full, 2, 7, now)).toEqual(addDays(d('2026-10-20'), 7));
  });

  it('el concepto de la factura dice el plan y las fechas', () => {
    expect(invoiceConcept('WEEK', d('2026-10-21'), d('2026-10-28'))).toBe('Destacado en CycloNet Market · 7 días (21/10 al 28/10)');
  });
});

describe('destacados: pagos y vencimientos (sync)', () => {
  /** Repositorio en memoria suficiente para el servicio. */
  function setup(rows: any[], invoiceStatus: string, settings = { priceWeek: 25000, priceMonth: 80000, slots: 2 }) {
    const matches = (r: any, w: any) => Object.entries(w).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && v._type === 'moreThan') return new Date(r[k]) > new Date(v._value);
      if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(r[k]);
      return r[k] === v;
    });
    const repo: any = {
      find: async ({ where }: any) => rows.filter((r) => (Array.isArray(where) ? where.some((w) => matches(r, w)) : matches(r, where))),
      findOne: async ({ where }: any) => rows.find((r) => matches(r, where)) || null,
      save: async (r: any) => r,
    };
    const platform: any = { findOne: async () => ({ value: settings }) };
    const svc = new FeaturedService(repo, platform);
    (svc as any).invoiceStatus = async () => invoiceStatus;
    return svc;
  }
  const now = d('2026-10-21');

  it('pagado a tiempo: se activa en su fecha', async () => {
    const r = { id: 'a', tenantId: 't1', days: 7, status: FeaturedStatus.PENDING_PAYMENT, invoiceId: '9', startsAt: d('2026-10-22'), endsAt: d('2026-10-29'), createdAt: d('2026-10-20') };
    await setup([r], 'Paid').sync(now);
    expect(r.status).toBe(FeaturedStatus.ACTIVE);
    expect(r.startsAt).toEqual(d('2026-10-22'));
  });

  it('pagado tarde: el periodo empieza al confirmar el pago', async () => {
    const r = { id: 'a', tenantId: 't1', days: 7, status: FeaturedStatus.PENDING_PAYMENT, invoiceId: '9', startsAt: d('2026-10-18'), endsAt: d('2026-10-25'), createdAt: d('2026-10-18') };
    await setup([r], 'Paid').sync(now);
    expect(r.status).toBe(FeaturedStatus.ACTIVE);
    expect(r.startsAt).toEqual(now);
    expect(r.endsAt).toEqual(addDays(now, 7));
  });

  it('sin pagar después del plazo libera el cupo; con pago reportado espera', async () => {
    const vencida = { id: 'a', tenantId: 't1', days: 7, status: FeaturedStatus.PENDING_PAYMENT, invoiceId: '9', startsAt: d('2026-10-16'), endsAt: d('2026-10-23'), createdAt: d('2026-10-16') };
    await setup([vencida], 'Issued').sync(now);
    expect(vencida.status).toBe(FeaturedStatus.CANCELLED);
    const reportada = { ...vencida, id: 'b', status: FeaturedStatus.PENDING_PAYMENT };
    await setup([reportada], 'Payment Reported').sync(now);
    expect(reportada.status).toBe(FeaturedStatus.PENDING_PAYMENT);
  });

  it('una reserva liberada que se paga después igual se activa', async () => {
    const r = { id: 'a', tenantId: 't1', days: 7, status: FeaturedStatus.CANCELLED, invoiceId: '9', startsAt: d('2026-10-10'), endsAt: d('2026-10-17'), createdAt: d('2026-10-10') };
    await setup([r], 'Paid').sync(now);
    expect(r.status).toBe(FeaturedStatus.ACTIVE);
    expect(r.startsAt).toEqual(now);
  });

  it('lo activo que terminó queda vencido', async () => {
    const r = { id: 'a', tenantId: 't1', days: 7, status: FeaturedStatus.ACTIVE, invoiceId: '9', startsAt: d('2026-10-10'), endsAt: d('2026-10-17'), createdAt: d('2026-10-09') };
    await setup([r], 'Paid').sync(now);
    expect(r.status).toBe(FeaturedStatus.EXPIRED);
  });
});

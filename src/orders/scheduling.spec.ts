import { BadRequestException } from '@nestjs/common';
import { assertSlotAvailable, bogotaDate, bogotaToUtc, buildSlots, resolveScheduling } from './scheduling';

// Lunes 28/09/2026 10:00 en Colombia = 15:00 UTC
const now = new Date('2026-09-28T15:00:00Z');
const opts = resolveScheduling({
  enabled: true,
  slotMinutes: 60,
  minLeadHours: 2,
  maxDaysAhead: 7,
  maxOrdersPerSlot: 2,
  hours: [
    { day: 1, active: true, open: '08:00', close: '14:00' },
    { day: 0, active: false, open: '08:00', close: '12:00' },
  ],
});

describe('conversión de hora de Colombia', () => {
  it('08:00 en Bogotá es 13:00 UTC', () => {
    expect(bogotaToUtc('2026-09-28', 8 * 60).toISOString()).toBe('2026-09-28T13:00:00.000Z');
  });

  it('la fecha local cambia a medianoche de Colombia, no de UTC', () => {
    expect(bogotaDate(new Date('2026-09-29T03:00:00Z'))).toBe('2026-09-28');
  });
});

describe('resolveScheduling', () => {
  it('desactivado por defecto y con valores sanos', () => {
    const s = resolveScheduling(null);
    expect(s.enabled).toBe(false);
    expect(s.hours).toHaveLength(7);
  });

  it('un día con cierre antes de la apertura queda inactivo', () => {
    const s = resolveScheduling({ hours: [{ day: 2, active: true, open: '18:00', close: '08:00' }] } as any);
    expect(s.hours.find((h) => h.day === 2)!.active).toBe(false);
  });
});

describe('buildSlots', () => {
  it('parte el horario en franjas y marca pasadas y sin anticipación', () => {
    const slots = buildSlots('2026-09-28', opts, { now });
    expect(slots).toHaveLength(6); // 08–14 en franjas de 1 h
    // Son las 10:00: 08, 09 y 10 ya pasaron; 11 no cumple las 2 h; 12 empieza justo a las 2 h
    expect(slots.map((s) => s.reason ?? 'OK')).toEqual(['PASADA', 'PASADA', 'PASADA', 'ANTICIPACION', 'OK', 'OK']);
  });

  it('no ofrece franjas antes de que el pedido pueda estar listo (cola / fabricación)', () => {
    const slots = buildSlots('2026-10-05', opts, { now, earliestReadyAt: bogotaToUtc('2026-10-05', 10 * 60 + 30) });
    expect(slots.filter((s) => s.available).map((s) => s.start.toISOString())).toEqual([
      bogotaToUtc('2026-10-05', 11 * 60).toISOString(),
      bogotaToUtc('2026-10-05', 12 * 60).toISOString(),
      bogotaToUtc('2026-10-05', 13 * 60).toISOString(),
    ]);
  });

  it('respeta el cupo por franja', () => {
    const taken = new Map([[bogotaToUtc('2026-10-05', 9 * 60).getTime(), 2]]);
    const slot = buildSlots('2026-10-05', opts, { now, takenBySlotStart: taken }).find((s) => s.start.getTime() === bogotaToUtc('2026-10-05', 9 * 60).getTime())!;
    expect(slot).toMatchObject({ available: false, reason: 'LLENA', remaining: 0 });
  });

  it('días cerrados, fuera del rango o con la programación desactivada no tienen franjas', () => {
    expect(buildSlots('2026-10-04', opts, { now })).toHaveLength(0); // domingo
    expect(buildSlots('2026-10-12', opts, { now })).toHaveLength(0); // más de 7 días
    expect(buildSlots('2026-09-27', opts, { now })).toHaveLength(0); // ayer
    expect(buildSlots('2026-10-05', { ...opts, enabled: false }, { now })).toHaveLength(0);
  });
});

describe('assertSlotAvailable', () => {
  it('acepta una franja válida y devuelve su fin', () => {
    const r = assertSlotAvailable(bogotaToUtc('2026-10-05', 9 * 60).toISOString(), opts, { now });
    expect(r.end.toISOString()).toBe(bogotaToUtc('2026-10-05', 10 * 60).toISOString());
  });

  it('rechaza horas que no son inicio de franja y franjas sin tiempo de preparación', () => {
    expect(() => assertSlotAvailable(bogotaToUtc('2026-10-05', 9 * 60 + 15), opts, { now })).toThrow(/no existe/);
    expect(() => assertSlotAvailable(bogotaToUtc('2026-10-05', 9 * 60), opts, {
      now, earliestReadyAt: bogotaToUtc('2026-10-05', 12 * 60),
    })).toThrow(/no alcanza/);
    expect(() => assertSlotAvailable('mañana', opts, { now })).toThrow(BadRequestException);
  });
});

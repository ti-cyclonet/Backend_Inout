import { BadRequestException } from '@nestjs/common';
import { assertOpenForAsap, assertSlotAvailable, bogotaDate, bogotaToUtc, buildSlots, describeOpening, formatHour, isOpenAt, nextOpening, resolveScheduling } from './scheduling';

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

describe('horario de atención', () => {
  // Lunes a sábado 18:30–22:00; domingo cerrado
  const store = resolveScheduling({
    enabled: false,
    onlyDuringHours: true,
    hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, active: day !== 0, open: '18:30', close: '22:00' })),
  });
  const at = (iso: string) => new Date(iso);

  it('onlyDuringHours es falso por defecto', () => {
    expect(resolveScheduling(null).onlyDuringHours).toBe(false);
  });

  it('abierta dentro de la franja y cerrada fuera (hora de Colombia)', () => {
    // Lunes 28/09 19:00 Bogotá = 29/09 00:00 UTC
    expect(isOpenAt(store, at('2026-09-29T00:00:00Z'))).toBe(true);
    // Lunes 10:00 Bogotá
    expect(isOpenAt(store, at('2026-09-28T15:00:00Z'))).toBe(false);
    // 22:00 en punto ya cerró
    expect(isOpenAt(store, at('2026-09-29T03:00:00Z'))).toBe(false);
    // Domingo 27/09 19:00 Bogotá
    expect(isOpenAt(store, at('2026-09-28T00:00:00Z'))).toBe(false);
  });

  it('próxima apertura: hoy más tarde, mañana o el próximo día activo', () => {
    const lunesManana = at('2026-09-28T15:00:00Z');
    expect(describeOpening(nextOpening(store, lunesManana)!, lunesManana)).toBe('hoy a las 6:30 p. m.');
    const lunesNoche = at('2026-09-29T04:00:00Z'); // lunes 23:00
    expect(describeOpening(nextOpening(store, lunesNoche)!, lunesNoche)).toBe('mañana a las 6:30 p. m.');
    const sabadoNoche = at('2026-10-04T04:00:00Z'); // sábado 03/10 23:00 → domingo cerrado
    expect(describeOpening(nextOpening(store, sabadoNoche)!, sabadoNoche)).toBe('el lunes a las 6:30 p. m.');
  });

  it('rechaza un pedido inmediato con la tienda cerrada y dice cuándo abre', () => {
    expect(() => assertOpenForAsap(store, at('2026-09-28T15:00:00Z'))).toThrow(
      'La tienda está cerrada en este momento. Abrimos hoy a las 6:30 p. m. Haz tu pedido dentro de nuestro horario de atención.',
    );
    expect(() => assertOpenForAsap({ ...store, enabled: true }, at('2026-09-28T15:00:00Z'))).toThrow(/Puedes programar tu pedido/);
    expect(() => assertOpenForAsap(store, at('2026-09-29T00:00:00Z'))).not.toThrow();
  });

  it('sin la restricción acepta pedidos a cualquier hora', () => {
    expect(() => assertOpenForAsap({ ...store, onlyDuringHours: false }, at('2026-09-28T15:00:00Z'))).not.toThrow();
  });

  it('formatHour', () => {
    expect(formatHour('00:15')).toBe('12:15 a. m.');
    expect(formatHour('12:00')).toBe('12:00 p. m.');
    expect(formatHour('08:05')).toBe('8:05 a. m.');
  });
});

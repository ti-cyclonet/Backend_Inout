import { BadRequestException } from '@nestjs/common';
import {
  ReservationLike, assertBookableDate, assertTransition, depositFor, diningSlots, findConflict, nextReservationCode,
  resolveDiningSettings, validateDiningSettings, validateTable,
} from './dining-rules';
import { bogotaToUtc } from '../orders/scheduling';

describe('Mesas y reservas', () => {
  // Viernes 6 de noviembre de 2026, 2:00 p. m. en Colombia
  const now = bogotaToUtc('2026-11-06', 14 * 60);
  const at = (hhmm: string, date = '2026-11-06') => bogotaToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
  const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, active: day !== 1, open: '12:00', close: '22:00' }));
  const tables = [
    { id: 't2', name: 'Mesa 2', seats: 2, active: true },
    { id: 't4', name: 'Mesa 4', seats: 4, active: true },
    { id: 't8', name: 'Mesa 8', seats: 8, active: false },
  ];
  const res = (id: string, tableIds: string[], start: string, end: string, status: any = 'CONFIRMED'): ReservationLike =>
    ({ id, tableIds, startAt: at(start), endAt: at(end), status });

  it('configuración por defecto y límites', () => {
    expect(resolveDiningSettings(null)).toMatchObject({ durationMinutes: 90, toleranceMinutes: 15, slotMinutes: 30, preorderMode: 'optional', depositMode: 'none', onlineEnabled: false });
    expect(resolveDiningSettings({ durationMinutes: 5, slotMinutes: 45, preorderMode: 'x' as any })).toMatchObject({ durationMinutes: 15, slotMinutes: 30, preorderMode: 'optional' });
    expect(() => validateDiningSettings({ depositMode: 'required', depositAmount: 0 })).toThrow(BadRequestException);
    expect(depositFor(resolveDiningSettings({ depositMode: 'required', depositAmount: 10000, depositPerPerson: true }), 3)).toBe(30000);
    expect(depositFor(resolveDiningSettings({ depositMode: 'none', depositAmount: 10000 }), 3)).toBe(0);
  });

  it('valida la mesa', () => {
    expect(validateTable({ name: ' Mesa 4 ', seats: 4, posX: 120, posY: -3 })).toMatchObject({ name: 'Mesa 4', zone: 'Salón', seats: 4, shape: 'square', posX: 100, posY: 0, joinable: false });
    expect(() => validateTable({ name: '', seats: 4 })).toThrow(/nombre/);
    expect(() => validateTable({ name: 'Mesa', seats: 0 })).toThrow(/puestos/);
    expect(validateTable({ posX: 33.33 }, true)).toEqual({ posX: 33.3 });
  });

  it('choques: misma mesa y horas que se cruzan', () => {
    const list = [res('a', ['t4'], '19:00', '20:30'), res('b', ['t2'], '19:00', '20:30', 'CANCELLED')];
    expect(findConflict(['t4'], at('20:00'), at('21:30'), list, now)?.id).toBe('a');
    expect(findConflict(['t4'], at('20:30'), at('22:00'), list, now)).toBeNull();
    expect(findConflict(['t2'], at('19:00'), at('20:30'), list, now)).toBeNull();
    expect(findConflict(['t4'], at('19:00'), at('20:30'), list, now, 'a')).toBeNull();
  });

  it('una mesa ocupada que se pasó de la hora sigue ocupada', () => {
    const late = [res('s', ['t4'], '12:00', '13:30', 'SEATED')];
    expect(findConflict(['t4'], now, at('15:30'), late, now)?.id).toBe('s');
    expect(findConflict(['t4'], at('14:30'), at('16:00'), late, now)).toBeNull();
  });

  it('horas disponibles: horario, anticipación, última llegada y mesas llenas', () => {
    const settings = resolveDiningSettings({ minLeadHours: 1, slotMinutes: 60 });
    const slots = diningSlots('2026-11-06', 3, settings, hours, tables, [res('a', ['t4'], '19:00', '20:30')], now);
    const map = Object.fromEntries(slots.map((s) => [s.start.toISOString(), s]));
    expect(slots).toHaveLength(10); // 12:00 … 21:00 (cierra 22:00, última llegada 21:30)
    expect(map[at('13:00').toISOString()]).toMatchObject({ available: false, reason: 'PASADA' });
    expect(map[at('14:00').toISOString()]).toMatchObject({ available: false, reason: 'PASADA' });
    expect(map[at('15:00').toISOString()]).toMatchObject({ available: true, tableId: 't4' });
    // Solo la Mesa 4 sirve para 3 (la de 8 está inactiva): choca a las 18:00, 19:00 y 20:00
    expect(map[at('18:00').toISOString()]).toMatchObject({ available: false, reason: 'LLENA' });
    expect(map[at('20:00').toISOString()]).toMatchObject({ available: false, reason: 'LLENA' });
    expect(map[at('21:00').toISOString()]).toMatchObject({ available: true });
    // Para 2 personas sugiere la mesa más pequeña
    expect(diningSlots('2026-11-06', 2, settings, hours, tables, [], now).find((s) => s.available)?.tableId).toBe('t2');
    // Lunes cerrado
    expect(diningSlots('2026-11-09', 2, settings, hours, tables, [], now)).toEqual([]);
  });

  it('anticipación y días adelante para reservar', () => {
    const s = resolveDiningSettings({ minLeadHours: 2, maxDaysAhead: 7 });
    expect(() => assertBookableDate(at('15:00'), s, now)).toThrow(/anticipación/);
    expect(() => assertBookableDate(at('19:00'), s, now)).not.toThrow();
    expect(() => assertBookableDate(at('19:00', '2026-11-20'), s, now)).toThrow(/7 días/);
  });

  it('cambios de estado', () => {
    expect(() => assertTransition('CONFIRMED', 'SEATED')).not.toThrow();
    expect(() => assertTransition('SEATED', 'COMPLETED')).not.toThrow();
    expect(() => assertTransition('PENDING', 'CONFIRMED')).not.toThrow();
    expect(() => assertTransition('COMPLETED', 'SEATED')).toThrow(/finalizada/);
    expect(() => assertTransition('SEATED', 'CANCELLED')).toThrow(BadRequestException);
  });

  it('códigos de reserva', () => {
    expect(nextReservationCode(null)).toBe('RS-00001');
    expect(nextReservationCode('RS-00041')).toBe('RS-00042');
  });
});

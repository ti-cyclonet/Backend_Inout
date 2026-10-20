import { OrderStatus } from './entities/order.entity';
import { estimateQueue, productionMinutes, QueueOrder, resolveTimingSettings } from './order-timing';
import { maxPeople, nextWorkStart, peopleAt, resolveShifts } from './shifts';

// Hora de Colombia (UTC-5) del lunes 28/09/2026
const at = (hhmm: string, day = 28) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 8, day, h + 5, m));
};

// Lunes a sábado: mañana con 2 personas, tarde con 1
const SHIFTS = [
  { name: 'Mañana', days: [1, 2, 3, 4, 5, 6], start: '08:00', end: '14:00', people: 2 },
  { name: 'Tarde', days: [1, 2, 3, 4, 5, 6], start: '14:00', end: '18:00', people: 1 },
];
const settings = resolveTimingSettings({ shifts: SHIFTS } as any);

const order = (id: string, batchMinutes: number[], enteredAt: Date, status = OrderStatus.CONFIRMED): QueueOrder => ({
  id, status, stageEnteredAt: enteredAt, createdAt: enteredAt,
  leadHours: batchMinutes.reduce((a, b) => a + b, 0) / 60, batchMinutes,
});
const ready = (orders: QueueOrder[], now: Date, id = 'new') =>
  estimateQueue(orders, settings, now).find((e) => e.id === id)!.estimatedReadyAt.toISOString();

describe('turnos de producción', () => {
  it('descarta turnos incompletos y normaliza', () => {
    expect(resolveShifts([
      { days: [1], start: '8:00', end: '12:00', people: 2 },
      { days: [1], start: '12:00', end: '10:00', people: 1 }, // termina antes de empezar
      { days: [], start: '08:00', end: '12:00', people: 1 }, // sin días
      { days: [2], start: '08:00', end: '12:00', people: 0 }, // sin personas
    ])).toEqual([{ days: [1], start: '08:00', end: '12:00', people: 2 }]);
  });

  it('personas en cada momento y próxima hora de trabajo', () => {
    expect(maxPeople(settings.shifts)).toBe(2);
    expect(peopleAt(settings.shifts, at('09:00').getTime())).toBe(2);
    expect(peopleAt(settings.shifts, at('15:00').getTime())).toBe(1);
    expect(peopleAt(settings.shifts, at('19:00').getTime())).toBe(0);
    // La segunda persona (1) no trabaja en la tarde: sigue el martes a las 08:00
    expect(new Date(nextWorkStart(settings.shifts, 1, at('15:00').getTime())!).toISOString()).toBe(at('08:00', 29).toISOString());
    // El domingo no hay turno: del sábado 26 en la noche al lunes 28
    expect(new Date(nextWorkStart(settings.shifts, 0, at('19:00', 26).getTime())!).toISOString()).toBe(at('08:00', 28).toISOString());
  });

  it('dos personas se reparten las tandas', () => {
    // 3 piñas de 10 min a las 10:00: 2 a la vez y luego 1 → 10:20
    expect(ready([order('new', [10, 10, 10], at('10:00'))], at('10:00'))).toBe(at('10:20').toISOString());
  });

  it('en la tarde hay una sola persona: se suman', () => {
    expect(ready([order('new', [10, 10, 10], at('15:00'))], at('15:00'))).toBe(at('15:30').toISOString());
  });

  it('fuera de turno empieza en el siguiente', () => {
    expect(ready([order('new', [10, 10], at('19:00'))], at('19:00'))).toBe(at('08:10', 29).toISOString());
  });

  it('la tanda que empezó se termina aunque cierre el turno', () => {
    // 13:55: las dos personas toman una tanda de 20 min cada una → 14:15
    expect(ready([order('new', [20, 20], at('13:55'))], at('13:55'))).toBe(at('14:15').toISOString());
  });

  it('lo que ya está en cola ocupa a las personas', () => {
    const now = at('10:00');
    const enProduccion = order('p1', [30, 30], at('10:00'), OrderStatus.IN_PRODUCTION); // las dos hasta 10:30
    expect(ready([enProduccion, order('new', [10], now)], now)).toBe(at('10:40').toISOString());
  });

  it('el tiempo de la etapa reparte las tandas entre el máximo de personas', () => {
    expect(productionMinutes(settings, 0.5, [10, 10, 10])).toBe(20);
    expect(productionMinutes(resolveTimingSettings({}), 0.5, [10, 10, 10])).toBe(30); // sin turnos: suma
  });
});

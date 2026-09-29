import { OrderStatus } from './entities/order.entity';
import { AutomationOrder, isDepositExpired, isLayawayExpired, layawayReminderDue } from './order-automation.rules';

const now = new Date('2026-09-29T15:00:00Z');
const base: AutomationOrder = {
  status: OrderStatus.CONFIRMED,
  paymentPlan: 'MITAD_MITAD',
  total: 100000,
  amountPaid: 0,
  depositRequired: 50000,
  depositDeadline: new Date('2026-09-29T14:00:00Z'),
  layawayDeadline: null,
};

describe('isDepositExpired', () => {
  it('cancela un pedido confirmado con el anticipo vencido y sin cubrir', () => {
    expect(isDepositExpired(base, now, false)).toBe(true);
  });

  it('no cancela si el cliente subió un comprobante que falta verificar', () => {
    expect(isDepositExpired(base, now, true)).toBe(false);
  });

  it('no cancela si el plazo no ha vencido, si el anticipo está cubierto o si ya se está preparando', () => {
    expect(isDepositExpired({ ...base, depositDeadline: new Date('2026-09-29T16:00:00Z') }, now, false)).toBe(false);
    expect(isDepositExpired({ ...base, amountPaid: 50000 }, now, false)).toBe(false);
    expect(isDepositExpired({ ...base, status: OrderStatus.IN_PRODUCTION }, now, false)).toBe(false);
  });

  it('no aplica a contra entrega, crédito ni pedidos sin plan', () => {
    expect(isDepositExpired({ ...base, paymentPlan: 'CONTRA_ENTREGA' }, now, false)).toBe(false);
    expect(isDepositExpired({ ...base, paymentPlan: 'CREDITO' }, now, false)).toBe(false);
    expect(isDepositExpired({ ...base, paymentPlan: null }, now, false)).toBe(false);
  });
});

describe('plan separe', () => {
  const layaway: AutomationOrder = { ...base, paymentPlan: 'PLAN_SEPARE', amountPaid: 20000, depositRequired: 20000, layawayDeadline: '2026-10-02' };

  it('vence el día siguiente a la fecha límite si queda saldo', () => {
    expect(isLayawayExpired(layaway, '2026-10-02')).toBe(false);
    expect(isLayawayExpired(layaway, '2026-10-03')).toBe(true);
    expect(isLayawayExpired({ ...layaway, amountPaid: 100000 }, '2026-10-03')).toBe(false);
    expect(isLayawayExpired({ ...layaway, status: OrderStatus.DELIVERED }, '2026-10-03')).toBe(false);
  });

  it('recuerda 7, 3 y 1 días antes, solo con saldo pendiente', () => {
    expect(layawayReminderDue(layaway, '2026-09-25')).toBe(7);
    expect(layawayReminderDue(layaway, '2026-09-29')).toBe(3);
    expect(layawayReminderDue(layaway, '2026-10-01')).toBe(1);
    expect(layawayReminderDue(layaway, '2026-09-30')).toBeNull();
    expect(layawayReminderDue({ ...layaway, amountPaid: 100000 }, '2026-10-01')).toBeNull();
    expect(layawayReminderDue({ ...layaway, status: OrderStatus.CANCELLED }, '2026-10-01')).toBeNull();
  });
});

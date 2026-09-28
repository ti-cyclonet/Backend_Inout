import { BadRequestException } from '@nestjs/common';
import {
  balanceDue,
  computePaymentStatus,
  computePlanTerms,
  isDepositCovered,
  resolvePaymentOptions,
} from './payment-plans';

const allOn = resolvePaymentOptions({
  contado: { enabled: true },
  contraEntrega: { enabled: true, maxOrderTotal: 500000 },
  mitadMitad: { enabled: true, depositPercent: 50 },
  planSepare: { enabled: true, minInitialPercent: 20, maxDays: 60, minOrderTotal: 100000 },
  credito: { enabled: true },
  depositTimeoutHours: 24,
  madeToOrderRequiresDeposit: true,
  instructions: 'Nequi 300',
});
const now = new Date('2026-09-28T15:00:00Z');
const guest = { hasAccount: false, hasMadeToOrder: false, now };
const client = { hasAccount: true, hasMadeToOrder: false, now };

describe('resolvePaymentOptions', () => {
  it('sin configuración conserva el comportamiento anterior (contado + crédito)', () => {
    const o = resolvePaymentOptions(null);
    expect(o.contado.enabled).toBe(true);
    expect(o.credito.enabled).toBe(true);
    expect(o.contraEntrega.enabled).toBe(false);
    expect(o.mitadMitad.enabled).toBe(false);
    expect(o.planSepare.enabled).toBe(false);
  });

  it('acota porcentajes y plazos fuera de rango', () => {
    const o = resolvePaymentOptions({ mitadMitad: { enabled: true, depositPercent: 150 }, planSepare: { enabled: true, minInitialPercent: 0, maxDays: 9999 } } as any);
    expect(o.mitadMitad.depositPercent).toBe(99);
    expect(o.planSepare.minInitialPercent).toBe(1);
    expect(o.planSepare.maxDays).toBe(365);
  });
});

describe('computePlanTerms', () => {
  it('contado exige el total como anticipo con plazo de verificación', () => {
    const t = computePlanTerms('CONTADO', allOn, { ...guest, total: 80000 });
    expect(t.depositRequired).toBe(80000);
    expect(t.depositDeadline?.toISOString()).toBe('2026-09-29T15:00:00.000Z');
    expect(t.layawayDeadline).toBeNull();
  });

  it('50/50 exige el porcentaje configurado', () => {
    expect(computePlanTerms('MITAD_MITAD', allOn, { ...guest, total: 99999 }).depositRequired).toBe(49999.5);
  });

  it('contra entrega no exige anticipo', () => {
    const t = computePlanTerms('CONTRA_ENTREGA', allOn, { ...guest, total: 80000 });
    expect(t.depositRequired).toBe(0);
    expect(t.depositDeadline).toBeNull();
  });

  it('contra entrega respeta el tope y no aplica a productos por fabricar', () => {
    expect(() => computePlanTerms('CONTRA_ENTREGA', allOn, { ...guest, total: 600000 })).toThrow(BadRequestException);
    expect(() => computePlanTerms('CONTRA_ENTREGA', allOn, { ...guest, total: 1000, hasMadeToOrder: true })).toThrow(/anticipo/);
  });

  it('plan separe: cuota inicial, fecha límite en Colombia y exige cuenta', () => {
    const t = computePlanTerms('PLAN_SEPARE', allOn, { ...client, total: 200000 });
    expect(t.depositRequired).toBe(40000);
    expect(t.layawayDeadline).toBe('2026-11-27');
    expect(() => computePlanTerms('PLAN_SEPARE', allOn, { ...guest, total: 200000 })).toThrow(/Inicia sesión/);
    expect(() => computePlanTerms('PLAN_SEPARE', allOn, { ...client, total: 50000 })).toThrow(/desde/);
  });

  it('crédito exige cuenta y no pide anticipo', () => {
    expect(computePlanTerms('CREDITO', allOn, { ...client, total: 1000 }).depositRequired).toBe(0);
    expect(() => computePlanTerms('CREDITO', allOn, { ...guest, total: 1000 })).toThrow(BadRequestException);
  });

  it('rechaza planes desactivados en la tienda', () => {
    const off = resolvePaymentOptions({ contado: { enabled: false } } as any);
    expect(() => computePlanTerms('CONTADO', off, { ...guest, total: 1000 })).toThrow(/no ofrece/);
  });
});

describe('estado de pago', () => {
  it('pasa de anticipo pendiente a cubierto y a pagado', () => {
    const base = { total: 100000, depositRequired: 50000 };
    expect(computePaymentStatus({ ...base, amountPaid: 0 })).toBe('ANTICIPO_PENDIENTE');
    expect(computePaymentStatus({ ...base, amountPaid: 20000 })).toBe('PARCIAL');
    expect(computePaymentStatus({ ...base, amountPaid: 50000 })).toBe('ANTICIPO_CUBIERTO');
    expect(computePaymentStatus({ ...base, amountPaid: 100000 })).toBe('PAGADO');
  });

  it('sin anticipo: sin pago, parcial o pagado', () => {
    expect(computePaymentStatus({ total: 100, depositRequired: 0, amountPaid: 0 })).toBe('SIN_PAGO');
    expect(computePaymentStatus({ total: 100, depositRequired: 0, amountPaid: 30 })).toBe('PARCIAL');
  });

  it('saldo y anticipo cubierto', () => {
    expect(balanceDue({ total: 100, amountPaid: 130 })).toBe(0);
    expect(balanceDue({ total: 100, amountPaid: 30.1 })).toBe(69.9);
    expect(isDepositCovered({ depositRequired: 0, amountPaid: 0 })).toBe(true);
    expect(isDepositCovered({ depositRequired: 50, amountPaid: 49.99 })).toBe(false);
  });
});

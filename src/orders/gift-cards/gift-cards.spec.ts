import { BadRequestException } from '@nestjs/common';
import {
  allocateGiftCards,
  effectiveStatus,
  expiryFrom,
  generateGiftCardCode,
  normalizeGiftCardCode,
  resolveGiftCardOptions,
  validateGiftCardLine,
  validateGiftCardOptions,
} from './gift-cards';

const ON = resolveGiftCardOptions({ enabled: true, minAmount: 10000, maxAmount: 200000, presets: [5000, 50000, 20000, 50000, 900000], validityMonths: 6 });

describe('opciones de bonos', () => {
  it('por defecto apagado; normaliza rangos y valores sugeridos', () => {
    expect(resolveGiftCardOptions(null).enabled).toBe(false);
    expect(ON).toEqual({ enabled: true, minAmount: 10000, maxAmount: 200000, presets: [20000, 50000], validityMonths: 6 });
  });

  it('valida lo que guarda la tienda', () => {
    expect(() => validateGiftCardOptions({ minAmount: 500, maxAmount: 1000, validityMonths: 12 })).toThrow(BadRequestException);
    expect(() => validateGiftCardOptions({ minAmount: 20000, maxAmount: 10000, validityMonths: 12 })).toThrow(BadRequestException);
    expect(() => validateGiftCardOptions({ minAmount: 10000, maxAmount: 20000, validityMonths: 0 })).toThrow(BadRequestException);
    expect(validateGiftCardOptions({ enabled: true, minAmount: 10000, maxAmount: 20000, validityMonths: 12 }).enabled).toBe(true);
  });
});

describe('bono del carrito', () => {
  it('acepta un bono válido y limpia los textos', () => {
    expect(validateGiftCardLine({ amount: 50000, recipientName: '  Laura  Gómez ', recipientEmail: 'LAURA@Correo.co', message: ' Feliz día ' }, ON)).toEqual({
      amount: 50000, recipientName: 'Laura Gómez', recipientEmail: 'laura@correo.co', recipientPhone: null, senderName: null, message: 'Feliz día',
    });
  });

  it('rechaza tienda sin bonos, montos fuera de rango, sin destinatario o correo inválido', () => {
    expect(() => validateGiftCardLine({ amount: 50000, recipientName: 'Ana' }, resolveGiftCardOptions({}))).toThrow('no vende bonos');
    expect(() => validateGiftCardLine({ amount: 5000, recipientName: 'Ana' }, ON)).toThrow('El bono debe ser');
    expect(() => validateGiftCardLine({ amount: 15000.5, recipientName: 'Ana' }, ON)).toThrow(BadRequestException);
    expect(() => validateGiftCardLine({ amount: 50000, recipientName: ' ' }, ON)).toThrow('nombre');
    expect(() => validateGiftCardLine({ amount: 50000, recipientName: 'Ana', recipientEmail: 'ana@' }, ON)).toThrow('correo');
  });
});

describe('códigos', () => {
  it('genera BONO-XXXX-XXXX-XXXX sin caracteres confusos', () => {
    const code = generateGiftCardCode();
    expect(code).toMatch(/^BONO-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/);
    expect(generateGiftCardCode(() => 0)).toBe('BONO-2222-2222-2222');
  });

  it('normaliza lo que escribe el cliente', () => {
    expect(normalizeGiftCardCode(' bono 7k3m q9xf 2htr ')).toBe('BONO-7K3M-Q9XF-2HTR');
    expect(normalizeGiftCardCode('7K3M-Q9XF-2HTR')).toBe('BONO-7K3M-Q9XF-2HTR');
    expect(normalizeGiftCardCode('BONO-123')).toBe('');
  });
});

describe('vigencia y estado', () => {
  it('vence N meses después (fin de mes si no existe el día)', () => {
    expect(expiryFrom(new Date('2026-01-31T15:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(expiryFrom(new Date('2026-10-13T15:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-10-13');
  });

  it('un activo sin saldo se ve agotado y uno vencido, vencido', () => {
    const now = new Date('2026-10-13T00:00:00Z');
    expect(effectiveStatus({ status: 'ACTIVO', balance: 0, expiresAt: '2027-01-01' }, now)).toBe('AGOTADO');
    expect(effectiveStatus({ status: 'ACTIVO', balance: 10, expiresAt: '2026-10-01' }, now)).toBe('VENCIDO');
    expect(effectiveStatus({ status: 'ACTIVO', balance: 10, expiresAt: '2027-01-01' }, now)).toBe('ACTIVO');
    expect(effectiveStatus({ status: 'PENDIENTE', balance: 10 }, now)).toBe('PENDIENTE');
  });
});

describe('reparto entre bonos', () => {
  it('usa los bonos en orden sin pasarse del total ni del saldo', () => {
    expect(allocateGiftCards(70000, [{ id: 'a', balance: 50000 }, { id: 'b', balance: 50000 }])).toEqual([
      { id: 'a', amount: 50000 }, { id: 'b', amount: 20000 },
    ]);
    expect(allocateGiftCards(30000, [{ id: 'a', balance: 50000 }, { id: 'b', balance: 50000 }])).toEqual([{ id: 'a', amount: 30000 }]);
    expect(allocateGiftCards(10000, [{ id: 'a', balance: 0 }])).toEqual([]);
  });
});

import { depositWithGiftCards } from './gift-cards';
import { computePaymentStatus, isDepositCovered } from '../payment-plans';

describe('pagar parte del pedido con bonos', () => {
  it('contado: el anticipo es el total; con el bono queda parcial y no se prepara hasta pagar el resto', () => {
    const deposit = depositWithGiftCards(50000, 20000, 30000);
    expect(deposit).toBe(50000);
    expect(computePaymentStatus({ total: 50000, depositRequired: deposit, amountPaid: 20000 })).toBe('PARCIAL');
    expect(isDepositCovered({ depositRequired: deposit, amountPaid: 20000 })).toBe(false);
    expect(computePaymentStatus({ total: 50000, depositRequired: deposit, amountPaid: 50000 })).toBe('PAGADO');
  });

  it('mitad y mitad sobre lo que queda: anticipo = bono + mitad del resto', () => {
    const deposit = depositWithGiftCards(50000, 20000, 15000);
    expect(deposit).toBe(35000);
    expect(isDepositCovered({ depositRequired: deposit, amountPaid: 35000 })).toBe(true);
  });

  it('contra entrega: sin anticipo; el bono queda como pago parcial', () => {
    const deposit = depositWithGiftCards(50000, 20000, 0);
    expect(deposit).toBe(0);
    expect(computePaymentStatus({ total: 50000, depositRequired: deposit, amountPaid: 20000 })).toBe('PARCIAL');
  });

  it('los bonos cubren todo: pedido pagado', () => {
    const deposit = depositWithGiftCards(30000, 30000, 0);
    expect(computePaymentStatus({ total: 30000, depositRequired: deposit, amountPaid: 30000 })).toBe('PAGADO');
  });
});

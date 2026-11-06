import { BadRequestException } from '@nestjs/common';
import { normalizeSplitPayments, paymentParts } from './split-payments';

describe('normalizeSplitPayments', () => {
  it('efectivo + transferencia que suman el total', () => {
    expect(normalizeSplitPayments([{ method: 'EFECTIVO', amount: 10000 }, { method: 'TRANSFERENCIA', amount: 5000 }], 15000))
      .toEqual([{ method: 'EFECTIVO', amount: 10000 }, { method: 'TRANSFERENCIA', amount: 5000 }]);
  });

  it('un solo medio (o uno repetido) no es pago dividido', () => {
    expect(normalizeSplitPayments([{ method: 'NEQUI', amount: 15000 }], 15000)).toBeNull();
    expect(normalizeSplitPayments([{ method: 'NEQUI', amount: 5000 }, { method: 'nequi', amount: 10000 }], 15000)).toBeNull();
    expect(normalizeSplitPayments(undefined, 15000)).toBeNull();
  });

  it('si el total cambió (descuento automático), lo ajusta el efectivo', () => {
    expect(normalizeSplitPayments([{ method: 'TARJETA', amount: 5000 }, { method: 'EFECTIVO', amount: 10000 }], 14250))
      .toEqual([{ method: 'TARJETA', amount: 5000 }, { method: 'EFECTIVO', amount: 9250 }]);
  });

  it('sin efectivo, lo ajusta la última parte', () => {
    expect(normalizeSplitPayments([{ method: 'TARJETA', amount: 5000 }, { method: 'NEQUI', amount: 10000 }], 15500))
      .toEqual([{ method: 'TARJETA', amount: 5000 }, { method: 'NEQUI', amount: 10500 }]);
  });

  it('rechaza medios no válidos, valores en cero, demasiadas partes o una diferencia imposible', () => {
    expect(() => normalizeSplitPayments([{ method: 'BITCOIN', amount: 1 }, { method: 'EFECTIVO', amount: 1 }], 2)).toThrow(BadRequestException);
    expect(() => normalizeSplitPayments([{ method: 'EFECTIVO', amount: 0 }, { method: 'NEQUI', amount: 5 }], 5)).toThrow(BadRequestException);
    expect(() => normalizeSplitPayments(['EFECTIVO', 'NEQUI', 'TARJETA', 'OTRO', 'DAVIPLATA'].map((method) => ({ method, amount: 1 })), 5)).toThrow(BadRequestException);
    expect(() => normalizeSplitPayments([{ method: 'EFECTIVO', amount: 1000 }, { method: 'NEQUI', amount: 9000 }], 8000)).toThrow(BadRequestException);
  });
});

describe('paymentParts', () => {
  it('reparte para los reportes', () => {
    expect(paymentParts({ paymentType: 'CONTADO', paymentMethod: 'MIXTO', payments: [{ method: 'EFECTIVO', amount: 10000 }, { method: 'NEQUI', amount: 5000 }] }, 15000))
      .toEqual([{ method: 'EFECTIVO', amount: 10000 }, { method: 'NEQUI', amount: 5000 }]);
    expect(paymentParts({ paymentType: 'CONTADO', paymentMethod: 'TARJETA' }, 9000)).toEqual([{ method: 'TARJETA', amount: 9000 }]);
    expect(paymentParts({ paymentType: 'CREDITO' }, 9000)).toEqual([{ method: 'CREDITO', amount: 9000 }]);
  });
});

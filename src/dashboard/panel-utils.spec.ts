import { dayKey, saleAt, salesSinceParams } from './panel-utils';

describe('saleAt (fecha de una venta en los paneles)', () => {
  it('usa la fecha de venta aunque se haya registrado otro día', () => {
    const at = saleAt({ dtmDate: '2026-09-20', dtmCreationDate: new Date('2026-10-08T15:26:00Z') });
    expect(dayKey(at!)).toBe('2026-09-20');
  });

  it('si se registró el mismo día, conserva la hora real de registro', () => {
    const creada = new Date('2026-10-08T15:26:00Z'); // 10:26 a. m. en Bogotá
    expect(saleAt({ dtmDate: '2026-10-08', dtmCreationDate: creada })).toEqual(creada);
  });

  it('una venta de las 9 p. m. en Bogotá sigue siendo de ese día (UTC ya es el siguiente)', () => {
    const creada = new Date('2026-10-09T02:00:00Z'); // 8 oct, 9:00 p. m. en Bogotá
    expect(saleAt({ dtmDate: '2026-10-08', dtmCreationDate: creada })).toEqual(creada);
  });

  it('acepta la fecha como Date y, sin fecha de venta, usa la de registro', () => {
    expect(dayKey(saleAt({ dtmDate: new Date('2026-09-01T00:00:00Z'), dtmCreationDate: '2026-10-08T15:00:00Z' })!)).toBe('2026-09-01');
    expect(saleAt({ dtmDate: null, dtmCreationDate: '2026-10-08T15:00:00Z' })).toEqual(new Date('2026-10-08T15:00:00Z'));
  });

  it('el filtro de consulta lleva el día en Bogotá del inicio del rango', () => {
    expect(salesSinceParams(new Date('2026-10-01T05:00:00Z')).fromDay).toBe('2026-10-01');
  });
});

import { openingFromMaterialRow, parseDate, parseEntityType, parseNumber, validateOpening } from './opening-balance';

describe('saldo inicial · lectura de la plantilla', () => {
  it('tipo: etiquetas en español con o sin tildes', () => {
    expect(parseEntityType('Material')).toBe('material');
    expect(parseEntityType('MATERIAL COMPUESTO')).toBe('composite');
    expect(parseEntityType('Producto')).toBe('product');
    expect(parseEntityType('otro')).toBeNull();
  });

  it('números en formato colombiano, inglés o de Excel', () => {
    expect(parseNumber(1234.5)).toBe(1234.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('$ 3.200')).toBe(3200);
    expect(parseNumber('1,234.50')).toBe(1234.5);
    expect(parseNumber('2,5')).toBe(2.5);
    expect(parseNumber('0.75')).toBe(0.75);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNaN();
  });

  it('fechas: ISO, DD/MM/AAAA y serie de Excel', () => {
    expect(parseDate('2026-10-01')).toBe('2026-10-01');
    expect(parseDate('01/10/2026')).toBe('2026-10-01');
    expect(parseDate(46296)).toBe('2026-10-01');
    expect(parseDate('31/02/2026')).toBe('invalid');
    expect(parseDate(null)).toBeNull();
  });

  it('validación: cantidad > 0, costo obligatorio y fecha no futura', () => {
    expect(validateOpening({ quantity: 10, unitCost: 0 })).toBeNull();
    expect(validateOpening({ quantity: 0, unitCost: 5 })).toMatch(/mayor que cero/);
    expect(validateOpening({ quantity: 10, unitCost: null })).toMatch(/costo unitario es obligatorio/);
    expect(validateOpening({ quantity: 10, unitCost: 5, date: '2026-12-31' }, '2026-10-02')).toMatch(/futura/);
  });

  it('carga masiva de materiales: columnas opcionales', () => {
    expect(openingFromMaterialRow({})).toBeNull();
    expect(openingFromMaterialRow({ 'Stock inicial': 12, 'Costo unitario': '1.500' })).toEqual({ quantity: 12, unitCost: 1500, error: null });
    expect(openingFromMaterialRow({ 'Stock inicial': 12 })?.error).toMatch(/costo unitario/i);
    expect(openingFromMaterialRow({ 'Costo unitario': 900 })?.error).toMatch(/falta el Stock inicial/);
  });
});

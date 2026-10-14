import { areUnitsCompatible, convertUnits, normalizePackSize, packSizeFor, unitMismatchMessage } from './unit-conversion';

describe('conversión de unidades con paquetes y cajas', () => {
  it('un paquete de 28 unidades: descargar 7 unidades resta 0,25 paquetes', () => {
    expect(convertUnits(7, 'units', 'pack', 28)).toBeCloseTo(0.25);
    expect(convertUnits(2, 'pack', 'units', 28)).toBe(56);
  });

  it('una caja de 100 unidades se convierte a unidades, piezas y docenas', () => {
    expect(areUnitsCompatible('box', 'units', 100)).toBe(true);
    expect(convertUnits(50, 'units', 'box', 100)).toBeCloseTo(0.5);
    expect(convertUnits(1, 'box', 'doz', 96)).toBe(8);
  });

  it('sin tamaño: el paquete conserva 6 unidades y la caja no se convierte', () => {
    expect(convertUnits(3, 'units', 'pack')).toBeCloseTo(0.5);
    expect(areUnitsCompatible('box', 'units')).toBe(false);
    expect(() => convertUnits(1, 'units', 'box')).toThrow();
  });

  it('el tamaño no afecta otras familias', () => {
    expect(convertUnits(500, 'g', 'kg', 28)).toBeCloseTo(0.5);
    expect(areUnitsCompatible('kg', 'units', 28)).toBe(false);
  });

  it('normaliza el tamaño y solo lo guarda si hay paquetes o cajas', () => {
    expect(normalizePackSize('32')).toBe(32);
    expect(normalizePackSize(0)).toBeNull();
    expect(normalizePackSize(2.5)).toBeNull();
    expect(normalizePackSize('')).toBeNull();
    expect(packSizeFor('box', 'units', 100)).toBe(100);
    expect(packSizeFor('kg', 'g', 100)).toBeNull();
  });

  it('mensaje claro cuando a una caja le falta el tamaño', () => {
    expect(unitMismatchMessage('box', 'units')).toMatch(/cuántas unidades trae/);
    expect(unitMismatchMessage('kg', 'ml')).toMatch(/mismo tipo/);
  });
});

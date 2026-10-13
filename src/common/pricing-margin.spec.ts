import { BadRequestException } from '@nestjs/common';
import { actualMargin, effectiveMargin, minimumPrice, normalizeMarginPercent, priceWithMargin } from './pricing-margin';

describe('margen en tres niveles', () => {
  it('el del producto manda; si no, la categoría; si no, el período', () => {
    expect(effectiveMargin({ item: 60, category: 40, period: 35 })).toEqual({ percent: 60, source: 'PRODUCTO' });
    expect(effectiveMargin({ item: null, category: 40, period: 35 })).toEqual({ percent: 40, source: 'CATEGORIA' });
    expect(effectiveMargin({ item: undefined, category: null, period: 35 })).toEqual({ percent: 35, source: 'PERIODO' });
    expect(effectiveMargin({})).toEqual({ percent: 0, source: 'PERIODO' });
  });

  it('un margen de 0 % en el producto también cuenta (no hereda)', () => {
    expect(effectiveMargin({ item: 0, category: 40, period: 35 })).toEqual({ percent: 0, source: 'PRODUCTO' });
    expect(effectiveMargin({ item: '0', period: 35 }).percent).toBe(0);
  });

  it('precio sugerido, piso y margen real', () => {
    expect(priceWithMargin(18000, 35)).toBe(24300);
    expect(minimumPrice(18000, 0)).toBe(18000);
    expect(minimumPrice(18000, 10)).toBe(19800);
    expect(minimumPrice(18000, -5)).toBe(18000);
    expect(actualMargin(24300, 18000)).toBe(35);
    expect(actualMargin(1000, 0)).toBeNull();
  });

  it('valida lo que se guarda', () => {
    expect(normalizeMarginPercent('')).toBeNull();
    expect(normalizeMarginPercent(null)).toBeNull();
    expect(normalizeMarginPercent('42.456')).toBe(42.46);
    expect(() => normalizeMarginPercent(-1)).toThrow(BadRequestException);
    expect(() => normalizeMarginPercent(5000)).toThrow(BadRequestException);
    expect(() => normalizeMarginPercent('abc')).toThrow(BadRequestException);
  });
});

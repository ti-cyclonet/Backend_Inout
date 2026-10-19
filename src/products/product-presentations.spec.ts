import { cleanLabel, nameWithLabel, presentationName } from './product-presentations';

describe('product-presentations', () => {
  it('limpia el nombre de la presentación', () => {
    expect(cleanLabel('  12   oz ')).toBe('12 oz');
    expect(cleanLabel(undefined)).toBe('');
    expect(cleanLabel('x'.repeat(50))).toHaveLength(40);
  });

  it('agrega la presentación al nombre solo si no la tiene', () => {
    expect(nameWithLabel('FRESAS CON CREMA', '8 oz')).toBe('FRESAS CON CREMA 8 oz');
    expect(nameWithLabel('FRESAS CON CREMA 8 OZ', '8 oz')).toBe('FRESAS CON CREMA 8 OZ');
  });

  it('cambia la presentación del final del nombre', () => {
    expect(presentationName('FRESAS CON CREMA 8 OZ', '8 oz', '12 oz')).toBe('FRESAS CON CREMA 12 oz');
    expect(presentationName('FRESAS CON CREMA', null, '20 oz')).toBe('FRESAS CON CREMA 20 oz');
  });
});

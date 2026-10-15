import { BadRequestException } from '@nestjs/common';
import { choicesExtra, choicesText, resolveChoiceGroups, validateLineChoices } from './product-choices';

const blocks = [
  { title: 'Proteínas', items: [{ name: 'Pollo' }, { name: 'Carne' }, { name: 'Cerdo' }] },
  { title: 'Salsas', items: [{ name: 'Ajo' }, { name: 'Piña' }] },
];

describe('resolveChoiceGroups', () => {
  it('normaliza y descarta grupos sin lista', () => {
    expect(resolveChoiceGroups([{ block: '  Proteínas ', min: '2', max: 2 }, { block: '', min: 0, max: 1 }])).toEqual([
      { block: 'Proteínas', min: 2, max: 2 },
    ]);
    expect(resolveChoiceGroups(null)).toEqual([]);
  });

  it('rechaza rangos inválidos, repetidos y demasiados grupos', () => {
    expect(() => resolveChoiceGroups([{ block: 'A', min: 3, max: 2 }])).toThrow(BadRequestException);
    expect(() => resolveChoiceGroups([{ block: 'A', min: 0, max: 0 }])).toThrow(BadRequestException);
    expect(() => resolveChoiceGroups([{ block: 'A', min: 0, max: 1 }, { block: 'a', min: 0, max: 1 }])).toThrow(BadRequestException);
    expect(() => resolveChoiceGroups(['A', 'B', 'C', 'D', 'E'].map((block) => ({ block, min: 0, max: 1 })))).toThrow(BadRequestException);
    expect(() => resolveChoiceGroups('x')).toThrow(BadRequestException);
  });
});

describe('validateLineChoices', () => {
  const groups = [
    { block: 'Proteínas', min: 2, max: 2 },
    { block: 'Salsas', min: 0, max: 2 },
  ];

  it('acepta lo escogido y usa los nombres de la carta', () => {
    const r = validateLineChoices('AREPA', groups, blocks, [
      { group: 'proteínas', options: ['pollo', 'Cerdo'] },
      { group: 'Salsas', options: [] },
    ]);
    expect(r).toEqual([{ group: 'Proteínas', options: ['Pollo', 'Cerdo'] }]);
  });

  it('exige el mínimo y respeta el máximo', () => {
    expect(() => validateLineChoices('AREPA', groups, blocks, [{ group: 'Proteínas', options: ['Pollo'] }])).toThrow('elige 2 de Proteínas');
    expect(() => validateLineChoices('AREPA', groups, blocks, [])).toThrow(BadRequestException);
    expect(() =>
      validateLineChoices('AREPA', groups, blocks, [
        { group: 'Proteínas', options: ['Pollo', 'Carne'] },
        { group: 'Salsas', options: ['Ajo', 'Piña', 'Ajo', 'x'] },
      ]),
    ).toThrow('"x" no es una opción');
  });

  it('no cuenta repetidos', () => {
    expect(() => validateLineChoices('AREPA', groups, blocks, [{ group: 'Proteínas', options: ['Pollo', 'pollo'] }])).toThrow(
      BadRequestException,
    );
  });

  it('ignora grupos cuya lista ya no existe y el máximo no supera la lista', () => {
    expect(validateLineChoices('AREPA', [{ block: 'Bebidas', min: 1, max: 1 }], blocks, [])).toEqual([]);
    const r = validateLineChoices('X', [{ block: 'Salsas', min: 3, max: 5 }], blocks, [{ group: 'Salsas', options: ['Ajo', 'Piña'] }]);
    expect(r).toEqual([{ group: 'Salsas', options: ['Ajo', 'Piña'] }]);
  });
});

describe('adiciones con precio', () => {
  const withPrices = [...blocks, { title: 'Adiciones', items: [{ name: 'Queso', price: 3000 }, { name: 'Tocineta', price: 4500 }, { name: 'Cebolla', price: 0 }] }];

  it('guarda el precio de la carta de cada opción y lo suma', () => {
    const r = validateLineChoices('AREPA', [{ block: 'Adiciones', min: 0, max: 3 }], withPrices, [
      { group: 'Adiciones', options: ['queso', 'Cebolla', 'Tocineta'], prices: [1, 1, 1] },
    ]);
    expect(r).toEqual([{ group: 'Adiciones', options: ['Queso', 'Cebolla', 'Tocineta'], prices: [3000, 0, 4500] }]);
    expect(choicesExtra(r)).toBe(7500);
  });

  it('sin precios no agrega prices ni suma', () => {
    const r = validateLineChoices('AREPA', [{ block: 'Adiciones', min: 1, max: 1 }], withPrices, [{ group: 'Adiciones', options: ['Cebolla'] }]);
    expect(r).toEqual([{ group: 'Adiciones', options: ['Cebolla'] }]);
    expect(choicesExtra(r)).toBe(0);
    expect(choicesExtra(undefined)).toBe(0);
  });
});

describe('choicesText', () => {
  it('formatea para mostrar', () => {
    expect(choicesText([{ group: 'Proteínas', options: ['Pollo', 'Cerdo'] }, { group: 'S', options: [] }])).toEqual(['Proteínas: Pollo, Cerdo']);
    expect(choicesText(undefined)).toEqual([]);
  });

  it('muestra lo que suma cada adición', () => {
    expect(choicesText([{ group: 'Adiciones', options: ['Queso', 'Cebolla'], prices: [3000, 0] }])).toEqual(['Adiciones: Queso (+$3.000), Cebolla']);
    expect(choicesText([{ group: 'Adiciones', options: ['Combo'], prices: [1250000] }])).toEqual(['Adiciones: Combo (+$1.250.000)']);
  });
});

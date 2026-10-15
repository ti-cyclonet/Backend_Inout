import { EMPTY_MENU_EXTRAS, MENU_EXTRAS_LIMITS, removedImagePublicIds, resolveMenuExtras } from './menu-extras';

const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/inout/tenants/t1/menu/salsa.png';

describe('menu-extras', () => {
  it('sin configurar → vacío', () => {
    expect(resolveMenuExtras(null)).toEqual(EMPTY_MENU_EXTRAS);
    expect(resolveMenuExtras('basura')).toEqual(EMPTY_MENU_EXTRAS);
  });

  it('recorta textos y descarta renglones sin nombre y bloques vacíos', () => {
    const r = resolveMenuExtras({
      subtitle: '  Arepas   &  Patacones ',
      blocks: [
        { title: ' Proteínas ', items: [{ name: ' Chorizo ' }, { name: '   ' }, { name: 'Cerdo', note: ' de la casa ' }] },
        { title: 'Vacío', items: [{ name: '' }] },
        { title: '', items: [{ name: 'Sin título' }] },
      ],
    });
    expect(r.subtitle).toBe('Arepas & Patacones');
    expect(r.blocks).toEqual([
      {
        title: 'Proteínas',
        items: [
          { name: 'Chorizo', note: '', price: 0, imageUrl: null, imagePublicId: null },
          { name: 'Cerdo', note: 'de la casa', price: 0, imageUrl: null, imagePublicId: null },
        ],
      },
    ]);
  });

  it('precio de las adiciones: entero, con tope, y tomado de una nota que es solo un valor', () => {
    const r = resolveMenuExtras({
      blocks: [{ title: 'Adiciones', items: [
        { name: 'Queso', price: '3000' },
        { name: 'Tocineta', price: 2500.4 },
        { name: 'Huevo', note: '$3000' },
        { name: 'Maduro', note: ' + $ 3.500 ' },
        { name: 'Aguacate', note: '2 tajadas' },
        { name: 'Gratis', price: -10 },
        { name: 'Caro', price: 99_000_000 },
        { name: 'Con ambos', price: 1000, note: '$2000' },
      ] }],
    });
    expect(r.blocks[0].items.map((i) => [i.price, i.note])).toEqual([
      [3000, ''],
      [2500, ''],
      [3000, ''],
      [3500, ''],
      [0, '2 tajadas'],
      [0, ''],
      [MENU_EXTRAS_LIMITS.itemPrice, ''],
      [1000, '$2000'],
    ]);
  });

  it('solo acepta fotos de Cloudinary', () => {
    const r = resolveMenuExtras({
      blocks: [{ title: 'Salsas', items: [
        { name: 'Ajo', imageUrl: IMG, imagePublicId: 'inout/tenants/t1/menu/salsa' },
        { name: 'Piña', imageUrl: 'javascript:alert(1)', imagePublicId: 'x' },
        { name: 'Tomate', imageUrl: 'http://res.cloudinary.com/demo/a.png' },
      ] }],
    });
    expect(r.blocks[0].items.map((i) => i.imageUrl)).toEqual([IMG, null, null]);
    expect(r.blocks[0].items[1].imagePublicId).toBeNull();
  });

  it('zonas sin repetir (sin importar mayúsculas) y con tope', () => {
    const zones = ['Turbaco', 'turbaco ', 'Bonanza', '', ...Array.from({ length: 20 }, (_, i) => `Zona ${i}`)];
    const r = resolveMenuExtras({ deliveryZones: zones, deliveryOnly: true });
    expect(r.deliveryZones.slice(0, 2)).toEqual(['Turbaco', 'Bonanza']);
    expect(r.deliveryZones).toHaveLength(MENU_EXTRAS_LIMITS.zones);
    expect(r.deliveryOnly).toBe(true);
  });

  it('deliveryOnly solo con true', () => {
    expect(resolveMenuExtras({ deliveryOnly: 'sí' }).deliveryOnly).toBe(false);
  });

  it('removedImagePublicIds: las fotos que se quitaron', () => {
    const withImg = (id: string) => ({ name: id, note: '', price: 0, imageUrl: IMG, imagePublicId: id });
    const before = { ...EMPTY_MENU_EXTRAS, blocks: [{ title: 'S', items: [withImg('a'), withImg('b')] }] };
    const after = { ...EMPTY_MENU_EXTRAS, blocks: [{ title: 'S', items: [withImg('b')] }] };
    expect(removedImagePublicIds(before, after)).toEqual(['a']);
  });
});

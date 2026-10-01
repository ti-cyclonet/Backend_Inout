import { componentsCost, listPriceTotal, prorate, stockQuantityPerCombo, virtualAvailability, weightedCost, ComponentFacts } from './combo-math';

const product = (o: Partial<ComponentFacts> = {}): ComponentFacts => ({
  itemType: 'product', quantityMode: 'SALE', quantity: 1, listPrice: 0, stockUnitCost: 0, presentationFactor: 1, availableStock: 0, ...o,
});

describe('combo-math', () => {
  it('prorratea en proporción al precio normal y la suma cuadra exacto', () => {
    // Hamburguesa 18.000 + papas 6.000 + gaseosa 4.000 = 28.000 -> combo a 25.000
    const parts = prorate(25000, [18000, 6000, 4000]);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(25000);
    expect(parts[0]).toBeCloseTo(16071.43, 2);
  });

  it('prorratea por partes iguales si ningún componente tiene precio', () => {
    expect(prorate(100, [0, 0, 0])).toEqual([33.33, 33.33, 33.34]);
  });

  it('cantidad en unidad de stock: presentaciones x factor; empaque tal cual', () => {
    expect(stockQuantityPerCombo({ itemType: 'material', quantityMode: 'SALE', quantity: 2, presentationFactor: 500 })).toBe(1000);
    expect(stockQuantityPerCombo({ itemType: 'material', quantityMode: 'STOCK', quantity: 1, presentationFactor: 500 })).toBe(1);
    expect(stockQuantityPerCombo({ itemType: 'product', quantityMode: 'SALE', quantity: 3, presentationFactor: 0 })).toBe(3);
  });

  it('disponibilidad del combo virtual = mínimo entre componentes; bajo pedido no limita', () => {
    const comps = [
      product({ quantity: 1, availableStock: 0, madeToOrder: true }), // hamburguesa bajo pedido
      product({ quantity: 2, availableStock: 9 }), // 4 combos
      { ...product({ quantity: 1, availableStock: 3000 }), itemType: 'material' as const, presentationFactor: 500 }, // 6 combos
    ];
    expect(virtualAvailability(comps)).toBe(4);
    expect(virtualAvailability([product({ madeToOrder: true })])).toBeNull();
  });

  it('precio normal y costo del combo', () => {
    const comps = [
      product({ quantity: 2, listPrice: 5000, stockUnitCost: 2000 }),
      { ...product({ quantity: 1, stockUnitCost: 3 }), itemType: 'material' as const, quantityMode: 'STOCK' as const, listPrice: 999 },
    ];
    expect(listPriceTotal(comps)).toBe(10000); // el empaque no suma al precio normal
    expect(componentsCost(comps)).toBe(4003);
  });

  it('costo promedio ponderado del kit', () => {
    expect(weightedCost(10, 20000, 10, 22000)).toBe(21000);
    expect(weightedCost(0, 0, 5, 15000)).toBe(15000);
  });
});

import { computeSaleProfit, stockUnitCost } from './sale-profit';

describe('computeSaleProfit', () => {
  it('ingreso sin impuestos ni domicilio menos el costo', () => {
    const r = computeSaleProfit(
      [
        { itemType: 'product', entity: { fltCost: 4000 }, baseQuantity: 2 },
        // material de reventa: costo por unidad de stock (g) × cantidad en stock
        { itemType: 'material', entity: { fltPrice: 5 }, baseQuantity: 500 },
      ],
      { total: 20000, tax: 1000, deliveryFee: 3000 },
    );
    expect(r).toEqual({ revenue: 16000, cost: 10500, profit: 5500, marginPercent: 34.4, costIncomplete: false });
  });

  it('marca el costo incompleto cuando un ítem no tiene costo', () => {
    const r = computeSaleProfit([{ itemType: 'product', entity: { fltCost: 0 }, baseQuantity: 1 }], { total: 10000 });
    expect(r.profit).toBe(10000);
    expect(r.costIncomplete).toBe(true);
  });

  it('puede dar pérdida y sin ingreso no hay margen', () => {
    expect(computeSaleProfit([{ itemType: 'kit', entity: { fltCost: 9000 }, baseQuantity: 1 }], { total: 8000 }).profit).toBe(-1000);
    expect(computeSaleProfit([], { total: 0 }).marginPercent).toBeNull();
  });

  it('costo por unidad de stock según el tipo', () => {
    expect(stockUnitCost({ itemType: 'material_t', entity: { fltPrice: 3, fltCost: 99 } } as any)).toBe(3);
    expect(stockUnitCost({ itemType: 'product', entity: { fltCost: 7 } } as any)).toBe(7);
  });
});

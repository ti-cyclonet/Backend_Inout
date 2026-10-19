import { componentNeeds, recipeUnitCost, shortages, validYield, weightedCost } from './composite-recipe';

describe('composite-recipe', () => {
  // Pulpa de piña: 1200 g de piña (comprada en kg, $4.000/kg) + 100 g de azúcar
  // (comprada en kg, $3.000/kg) rinden 1000 g de pulpa.
  const recipe = [
    { componentMaterialId: 'pina', name: 'Piña', quantity: 1200, measureUnit: 'kg', dischargeUnit: 'g', unitPrice: 4000, stock: 2.24 },
    { componentMaterialId: 'azucar', name: 'Azúcar', quantity: 100, measureUnit: 'kg', dischargeUnit: 'g', unitPrice: 3000, stock: 5 },
  ];

  it('escala la receta a la cantidad a producir y la pasa a la unidad del stock', () => {
    const needs = componentNeeds(recipe, 1000, 500);
    expect(needs.map((n) => n.quantityInStockUnit)).toEqual([0.6, 0.05]);
  });

  it('el rendimiento no es la suma de los componentes', () => {
    // 1300 g de insumos rinden 1000 g: producir 1000 g consume la receta completa
    expect(componentNeeds(recipe, 1000, 1000).map((n) => n.quantityInStockUnit)).toEqual([1.2, 0.1]);
  });

  it('costo unitario = costo de la receta / rendimiento', () => {
    // 1,2 kg × 4000 + 0,1 kg × 3000 = 5100 por 1000 g
    expect(recipeUnitCost(recipe, 1000)).toBe(5.1);
  });

  it('detecta los componentes sin stock suficiente', () => {
    expect(shortages(componentNeeds(recipe, 1000, 2000)).map((n) => n.componentMaterialId)).toEqual(['pina']);
    expect(shortages(componentNeeds(recipe, 1000, 1000))).toEqual([]);
  });

  it('receta en unidades (UND) sin conversión', () => {
    const r = [{ componentMaterialId: 'huevo', quantity: 6, measureUnit: 'und', dischargeUnit: 'und', unitPrice: 500, stock: 30 }];
    expect(componentNeeds(r, 12, 24)[0].quantityInStockUnit).toBe(12);
    expect(recipeUnitCost(r, 12)).toBe(250);
  });

  it('costo promedio ponderado al sumar producción', () => {
    expect(weightedCost(0, 0, 1000, 5.1)).toBe(5.1);
    expect(weightedCost(1000, 4, 1000, 6)).toBe(5);
    expect(weightedCost(-20, 4, 100, 6)).toBe(6);
  });

  it('rendimiento válido', () => {
    expect(validYield(null)).toBeNull();
    expect(validYield(0)).toBeNull();
    expect(validYield('750')).toBe(750);
  });
});

import { legacyLeadHours, orderLeadColumns, orderLeadHours, productLeadHours } from './lead-time';

describe('lead-time', () => {
  it('los minutos mandan sobre las horas de respaldo', () => {
    expect(productLeadHours({ intProductionLeadMinutes: 30, intProductionLeadHours: 1 })).toBe(0.5);
    expect(productLeadHours({ intProductionLeadMinutes: 0, intProductionLeadHours: 2 })).toBe(0);
    expect(productLeadHours({ intProductionLeadMinutes: null, intProductionLeadHours: 2 })).toBe(2);
    expect(productLeadHours(null)).toBe(0);
  });

  it('pedido: minutos y horas enteras de respaldo', () => {
    expect(orderLeadColumns(0.75)).toEqual({ productionLeadHours: 1, productionLeadMinutes: 45 });
    expect(orderLeadColumns(0)).toEqual({ productionLeadHours: null, productionLeadMinutes: null });
    expect(orderLeadHours({ productionLeadMinutes: 45, productionLeadHours: 1 })).toBe(0.75);
    expect(orderLeadHours({ productionLeadHours: 3 })).toBe(3);
  });

  it('horas de respaldo para los minutos', () => {
    expect(legacyLeadHours(20)).toBe(1);
    expect(legacyLeadHours(120)).toBe(2);
    expect(legacyLeadHours(null)).toBeNull();
  });
});

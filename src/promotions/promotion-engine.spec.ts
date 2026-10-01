import { bestPromotion, bogotaMoment, discountFor, isPromotionLive, promotionMatches, PromotionRule } from './promotion-engine';

const rule = (o: Partial<PromotionRule> = {}): PromotionRule => ({
  id: 'p1', name: 'Promo', status: 'active', discountType: 'PERCENT', value: 20, scope: 'ITEMS',
  targets: [], channel: 'ALL', startDate: '2026-10-01', endDate: null, weekdays: null, timeFrom: null, timeTo: null, ...o,
});
// Jueves 1 oct 2026, 5:30 pm en Bogotá
const at = { date: '2026-10-01', weekday: 4, minutes: 17 * 60 + 30 };

describe('promotion-engine', () => {
  it('hora de Bogotá (UTC-5)', () => {
    expect(bogotaMoment(new Date('2026-10-01T22:30:00Z'))).toEqual(at);
    expect(bogotaMoment(new Date('2026-10-02T03:10:00Z'))).toEqual({ date: '2026-10-01', weekday: 4, minutes: 22 * 60 + 10 });
  });

  it('vigencia: fechas, días, franja (también cruzando medianoche) y canal', () => {
    expect(isPromotionLive(rule(), at, 'POS')).toBe(true);
    expect(isPromotionLive(rule({ status: 'inactive' }), at, 'POS')).toBe(false);
    expect(isPromotionLive(rule({ startDate: '2026-10-02' }), at, 'POS')).toBe(false);
    expect(isPromotionLive(rule({ endDate: '2026-09-30' }), at, 'POS')).toBe(false);
    expect(isPromotionLive(rule({ weekdays: [5, 6] }), at, 'POS')).toBe(false);
    expect(isPromotionLive(rule({ timeFrom: '16:00', timeTo: '18:00' }), at, 'POS')).toBe(true); // hora feliz
    expect(isPromotionLive(rule({ timeFrom: '16:00', timeTo: '17:30' }), at, 'POS')).toBe(false); // fin exclusivo
    expect(isPromotionLive(rule({ timeFrom: '22:00', timeTo: '02:00' }), { ...at, minutes: 60 }, 'POS')).toBe(true);
    expect(isPromotionLive(rule({ channel: 'MARKETPLACE' }), at, 'POS')).toBe(false);
  });

  it('a qué aplica: ítem, categoría, todo; los componentes de combo no reciben promos sueltas', () => {
    const burger = { itemType: 'product' as const, id: 'b', categoryId: 7 };
    expect(promotionMatches(rule({ targets: [{ type: 'product', id: 'b' }] }), burger)).toBe(true);
    expect(promotionMatches(rule({ targets: [{ type: 'category', id: '7' }] }), burger)).toBe(true);
    expect(promotionMatches(rule({ targets: [{ type: 'material', id: 'b' }] }), burger)).toBe(false);
    expect(promotionMatches(rule({ scope: 'ALL' }), burger)).toBe(true);
    expect(promotionMatches(rule({ targets: [{ type: 'product', id: 'b' }] }), { ...burger, insideCombo: true })).toBe(false);
    expect(promotionMatches(rule({ scope: 'ALL' }), { ...burger, insideCombo: true })).toBe(false);
    expect(promotionMatches(rule({ targets: [{ type: 'category', id: '7' }] }), { itemType: 'combo', id: 'c', categoryId: 7 })).toBe(false);
  });

  it('descuento por unidad con tope del período', () => {
    expect(discountFor({ discountType: 'PERCENT', value: 20 }, 10000)).toBe(2000);
    expect(discountFor({ discountType: 'FIXED', value: 3000 }, 10000)).toBe(3000);
    expect(discountFor({ discountType: 'FIXED', value: 30000 }, 10000)).toBe(10000);
    expect(discountFor({ discountType: 'PERCENT', value: 50 }, 10000, 30)).toBe(3000); // tope 30%
  });

  it('la mejor promoción por línea, sin acumular', () => {
    const promos = [
      rule({ id: 'a', name: '10% todo', scope: 'ALL', value: 10 }),
      rule({ id: 'b', name: '$3.000 en hamburguesa', discountType: 'FIXED', value: 3000, targets: [{ type: 'product', id: 'b' }] }),
      rule({ id: 'c', name: '50% solo marketplace', value: 50, scope: 'ALL', channel: 'MARKETPLACE' }),
    ];
    const best = bestPromotion(promos, { itemType: 'product', id: 'b' }, 18000, at, 'POS');
    expect(best).toMatchObject({ id: 'b', discountPerUnit: 3000 });
    expect(bestPromotion(promos, { itemType: 'product', id: 'b' }, 18000, at, 'MARKETPLACE')).toMatchObject({ id: 'c', discountPerUnit: 9000 });
    expect(bestPromotion([], { itemType: 'product', id: 'b' }, 18000, at, 'POS')).toBeNull();
  });
});

import { kitchenLabel, normalizeSector, resolveModules, validateModuleChange } from './business-modules.catalog';

describe('Funciones de mi negocio', () => {
  const on = (r: ReturnType<typeof resolveModules>) => r.modules.filter((m) => m.enabled).map((m) => m.key);

  it('un restaurante trae la cocina; un negocio de moda no', () => {
    const rest = resolveModules('restaurant');
    expect(rest.kitchenLabel).toBe('Cocina');
    expect(on(rest)).toEqual(['kitchen', 'combos', 'giftCards', 'credit', 'delivery']);
    expect(on(resolveModules('fashion'))).toEqual(['combos', 'giftCards', 'credit', 'delivery']);
  });

  it('las funciones que ya existían siguen activas para todos', () => {
    for (const s of ['general', 'hardware', 'services']) {
      expect(on(resolveModules(s))).toEqual(expect.arrayContaining(['combos', 'giftCards', 'credit', 'delivery']));
    }
  });

  it('lo que el negocio cambió manda sobre el sector', () => {
    const r = resolveModules('fashion', { kitchen: true, credit: false });
    expect(on(r)).toEqual(['kitchen', 'combos', 'giftCards', 'delivery']);
    expect(r.modules.find((m) => m.key === 'kitchen')).toMatchObject({ custom: true, recommended: true, name: 'Pantalla de preparación (Alistamiento)' });
  });

  it('mesas está anunciado pero no se activa todavía', () => {
    expect(resolveModules('restaurant', { tables: true }).modules.find((m) => m.key === 'tables')).toMatchObject({ enabled: false, recommended: true, available: false });
    expect(validateModuleChange('tables', true)).toMatch(/pronto/);
  });

  it('cocina oculta: sin mesas ni reservas, pero con pantalla de cocina', () => {
    const r = resolveModules('restaurant', { tables: true, kitchen: true }, { deliveryOnly: true });
    expect(r.modules.find((m) => m.key === 'tables')).toMatchObject({ enabled: false, blockedReason: expect.stringMatching(/cocina oculta/) });
    expect(r.modules.find((m) => m.key === 'kitchen')).toMatchObject({ enabled: true, blockedReason: null });
    expect(validateModuleChange('kitchen', true, { deliveryOnly: true })).toEqual({ key: 'kitchen', enabled: true });
  });

  it('valida el cambio y el sector', () => {
    expect(validateModuleChange('kitchen', true)).toEqual({ key: 'kitchen', enabled: true });
    expect(validateModuleChange('nada', true)).toMatch(/desconocida/);
    expect(validateModuleChange('kitchen', 'si')).toMatch(/activa/);
    expect(normalizeSector(' Restaurant ')).toBe('restaurant');
    expect(normalizeSector(null)).toBe('general');
    expect(kitchenLabel('manufacturing')).toBe('Producción');
  });
});

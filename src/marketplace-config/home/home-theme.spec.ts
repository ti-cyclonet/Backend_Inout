import { canEditHomeTheme, isHomeTheme } from './home-theme';

describe('tema de CycloNet Market', () => {
  it('solo temas de tarjetas', () => {
    expect(isHomeTheme('grid-fresh')).toBe(true);
    expect(isHomeTheme('grid-chic')).toBe(true);
    expect(isHomeTheme('menu-chalk')).toBe(false);
    expect(isHomeTheme(undefined)).toBe(false);
  });

  it('lo editan solo los tenant de CYCLONET_TENANT_IDS', () => {
    expect(canEditHomeTheme('t-1', ' t-1 , t-2 ')).toBe(true);
    expect(canEditHomeTheme('t-3', 't-1,t-2')).toBe(false);
    expect(canEditHomeTheme('t-1', '')).toBe(false);
    expect(canEditHomeTheme(undefined, 't-1')).toBe(false);
  });
});

/**
 * Tema de la vitrina CycloNet Market (/marketplace/home). Solo los temas de
 * tarjetas: la vitrina reúne productos de todas las tiendas y no tiene menú.
 * Lo cambia quien administra la cuenta de CycloNet en InOut: los tenant de la
 * variable CYCLONET_TENANT_IDS (separados por coma). Sin la variable, nadie.
 */
export const HOME_THEMES = ['grid', 'grid-fresh', 'grid-chic'];
export const HOME_THEME_KEY = 'home_display_mode';

export const isHomeTheme = (v: unknown): v is string => typeof v === 'string' && HOME_THEMES.includes(v);

export function homeThemeEditors(raw = process.env.CYCLONET_TENANT_IDS): string[] {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export const canEditHomeTheme = (tenantId: string | undefined, raw?: string): boolean =>
  !!tenantId && homeThemeEditors(raw).includes(tenantId);

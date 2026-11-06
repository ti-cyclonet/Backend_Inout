/**
 * Funciones de mi negocio: módulos que cada negocio activa según su tipo
 * (sector del contrato en Authoriza). Funciones puras.
 *
 * - `sectors`: tipos de negocio para los que el módulo es habitual
 *   ('all' = todos). Fuera de ellos se puede activar igual.
 * - `defaultOn`: con qué sectores viene activado si el negocio no lo ha
 *   tocado. Los módulos que ya existían vienen activos para todos, para no
 *   cambiarle nada a quien ya los usa.
 * - `available: false`: anunciado, aún no se puede activar.
 */

export const SECTORS = [
  'general', 'restaurant', 'fashion', 'hardware', 'retail', 'beauty', 'electronics',
  'automotive', 'health', 'sports', 'home', 'services', 'manufacturing',
] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  general: 'General',
  restaurant: 'Restaurante',
  fashion: 'Moda',
  hardware: 'Ferretería',
  retail: 'Comercio minorista',
  beauty: 'Belleza',
  electronics: 'Electrónica',
  automotive: 'Automotriz',
  health: 'Salud',
  sports: 'Deportes',
  home: 'Hogar',
  services: 'Servicios',
  manufacturing: 'Manufactura',
};

export type ModuleKey = 'kitchen' | 'tables' | 'combos' | 'giftCards' | 'credit' | 'delivery';

export interface ModuleDef {
  key: ModuleKey;
  name: string;
  description: string;
  sectors: Sector[] | 'all';
  defaultOn: Sector[] | 'all';
  available: boolean;
}

/** Sectores que venden o fabrican para entregar (alistan pedidos). */
const PREPARE: Sector[] = ['general', 'restaurant', 'manufacturing', 'retail', 'hardware', 'home', 'health', 'electronics', 'fashion', 'automotive', 'sports', 'beauty'];

export const MODULES: ModuleDef[] = [
  {
    key: 'kitchen',
    name: 'Pantalla de preparación',
    description: 'Los pedidos por preparar en pantalla completa (tablet o TV), con tiempos y alertas de atraso.',
    sectors: PREPARE,
    defaultOn: ['restaurant', 'manufacturing'],
    available: true,
  },
  {
    key: 'tables',
    name: 'Mesas y reservas',
    description: 'Plano del local, mesas en vivo y reservas desde la tienda online, con el pedido listo a la hora.',
    sectors: ['restaurant', 'manufacturing'],
    defaultOn: ['restaurant'],
    available: false,
  },
  {
    key: 'combos',
    name: 'Combos y promociones',
    description: 'Combos, kits armados y promociones por tiempo.',
    sectors: 'all',
    defaultOn: 'all',
    available: true,
  },
  {
    key: 'giftCards',
    name: 'Bonos de regalo',
    description: 'Bonos que tus clientes compran en la tienda y redimen en sus compras.',
    sectors: 'all',
    defaultOn: 'all',
    available: true,
  },
  {
    key: 'credit',
    name: 'Ventas a crédito y cartera',
    description: 'Cupo por cliente, abonos, recordatorios y cartera.',
    sectors: 'all',
    defaultOn: 'all',
    available: true,
  },
  {
    key: 'delivery',
    name: 'Domicilios con Shotra',
    description: 'Pide el domiciliario para tus pedidos sin salir de InOut.',
    sectors: 'all',
    defaultOn: 'all',
    available: true,
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

export function normalizeSector(raw: unknown): Sector {
  const s = String(raw ?? '').trim().toLowerCase();
  return (SECTORS as readonly string[]).includes(s) ? (s as Sector) : 'general';
}

const inList = (list: Sector[] | 'all', sector: Sector) => list === 'all' || list.includes(sector);

/** Nombre de la pantalla de preparación según el negocio. */
export function kitchenLabel(sector: Sector): string {
  if (sector === 'restaurant') return 'Cocina';
  if (sector === 'manufacturing') return 'Producción';
  return 'Alistamiento';
}

export interface ResolvedModule {
  key: ModuleKey;
  name: string;
  description: string;
  available: boolean;
  /** Habitual para el tipo de negocio. */
  recommended: boolean;
  enabled: boolean;
  /** El negocio lo cambió (si no, sigue el valor por defecto del sector). */
  custom: boolean;
  /** Tipos de negocio donde es habitual ('Todos' o la lista). */
  appliesTo: string;
  /** Por qué no se puede activar en este negocio (ej. cocina oculta). */
  blockedReason: string | null;
}

/** Lo que se sabe del negocio además de su sector. */
export interface BusinessContext {
  /** Cocina oculta: solo domicilios, sin atención en el local (carta de la tienda). */
  deliveryOnly?: boolean;
}

/** Módulos que necesitan atender en el local. */
const NEEDS_VENUE: ModuleKey[] = ['tables'];

function blockedReason(key: ModuleKey, ctx: BusinessContext): string | null {
  if (ctx.deliveryOnly && NEEDS_VENUE.includes(key)) {
    return 'Tu negocio está configurado como cocina oculta (solo domicilios). Para usar mesas y reservas, desactívalo en la carta de la tienda.';
  }
  return null;
}

export function resolveModules(sectorRaw: unknown, overrides?: Record<string, unknown> | null, ctx: BusinessContext = {}): {
  sector: Sector;
  sectorLabel: string;
  kitchenLabel: string;
  modules: ResolvedModule[];
} {
  const sector = normalizeSector(sectorRaw);
  const saved = overrides || {};
  const modules = MODULES.map((m) => {
    const custom = typeof saved[m.key] === 'boolean';
    const blocked = blockedReason(m.key, ctx);
    const enabled = m.available && !blocked && (custom ? (saved[m.key] as boolean) : inList(m.defaultOn, sector));
    return {
      key: m.key,
      name: m.key === 'kitchen' ? `${m.name} (${kitchenLabel(sector)})` : m.name,
      description: m.description,
      available: m.available,
      recommended: inList(m.sectors, sector),
      enabled,
      custom: custom && m.available,
      appliesTo: m.sectors === 'all' ? 'Todos los negocios' : m.sectors.map((s) => SECTOR_LABELS[s]).join(', '),
      blockedReason: blocked,
    };
  });
  return { sector, sectorLabel: SECTOR_LABELS[sector], kitchenLabel: kitchenLabel(sector), modules };
}

/** Valida un cambio: módulo conocido y disponible, valor booleano. */
export function validateModuleChange(key: unknown, enabled: unknown, ctx: BusinessContext = {}): { key: ModuleKey; enabled: boolean } | string {
  const def = MODULES.find((m) => m.key === key);
  if (!def) return 'Función desconocida.';
  if (!def.available) return `${def.name} estará disponible pronto.`;
  if (typeof enabled !== 'boolean') return 'Indica si la función queda activa o no.';
  const blocked = blockedReason(def.key, ctx);
  if (blocked && enabled) return blocked;
  return { key: def.key, enabled };
}

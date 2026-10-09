/**
 * Información de la carta del MarketPlace (no son productos): bloques como
 * "Proteínas" o "Salsas" con sus renglones (nombre, nota y foto opcionales),
 * subtítulo de la carta, zonas de domicilio y el aviso "solo domicilios"
 * (cocina oculta). La tienda lo configura en el modo administrador; la carta
 * y el encabezado de la tienda lo muestran. Funciones puras.
 */

export interface MenuExtraItem {
  name: string;
  /** "tradicional", "especial de la casa"… */
  note: string;
  /** Foto en Cloudinary (subida con POST /marketplace-config/:tenantId/menu-extras/image). */
  imageUrl: string | null;
  imagePublicId: string | null;
}

export interface MenuExtraBlock {
  title: string;
  items: MenuExtraItem[];
}

export interface MenuExtras {
  /** Texto de la cinta bajo el nombre ("Arepas & Patacones"); vacío = "Nuestro menú". */
  subtitle: string;
  /** Cocina oculta: solo domicilios, sin atención en el local. */
  deliveryOnly: boolean;
  deliveryZones: string[];
  blocks: MenuExtraBlock[];
}

export const EMPTY_MENU_EXTRAS: MenuExtras = { subtitle: '', deliveryOnly: false, deliveryZones: [], blocks: [] };

export const MENU_EXTRAS_LIMITS = {
  subtitle: 60,
  zones: 12,
  zone: 40,
  blocks: 6,
  blockTitle: 40,
  items: 20,
  itemName: 50,
  itemNote: 60,
};

/** Formatos y peso de las fotos de los renglones. */
export const MENU_EXTRA_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MENU_EXTRA_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Solo fotos subidas a Cloudinary (https); cualquier otra URL se descarta. */
const cloudinaryUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/.test(value) ? value : null;

/**
 * Normaliza lo guardado (o lo enviado): recorta textos, aplica los límites y
 * descarta renglones sin nombre, bloques sin título ni renglones y zonas repetidas.
 */
export function resolveMenuExtras(raw: any): MenuExtras {
  const src = raw && typeof raw === 'object' ? raw : {};
  const L = MENU_EXTRAS_LIMITS;

  const seen = new Set<string>();
  const deliveryZones: string[] = [];
  for (const z of Array.isArray(src.deliveryZones) ? src.deliveryZones : []) {
    const zone = text(z, L.zone);
    const key = zone.toLowerCase();
    if (!zone || seen.has(key)) continue;
    seen.add(key);
    deliveryZones.push(zone);
    if (deliveryZones.length >= L.zones) break;
  }

  const blocks: MenuExtraBlock[] = [];
  for (const b of Array.isArray(src.blocks) ? src.blocks : []) {
    if (!b || typeof b !== 'object') continue;
    const items: MenuExtraItem[] = [];
    for (const it of Array.isArray(b.items) ? b.items : []) {
      if (!it || typeof it !== 'object') continue;
      const name = text(it.name, L.itemName);
      if (!name) continue;
      const imageUrl = cloudinaryUrl(it.imageUrl);
      items.push({
        name,
        note: text(it.note, L.itemNote),
        imageUrl,
        imagePublicId: imageUrl && typeof it.imagePublicId === 'string' ? it.imagePublicId.slice(0, 200) : null,
      });
      if (items.length >= L.items) break;
    }
    const title = text(b.title, L.blockTitle);
    if (!title || !items.length) continue;
    blocks.push({ title, items });
    if (blocks.length >= L.blocks) break;
  }

  return {
    subtitle: text(src.subtitle, L.subtitle),
    deliveryOnly: src.deliveryOnly === true,
    deliveryZones,
    blocks,
  };
}

/** Fotos que estaban guardadas y ya no se usan (para borrarlas de Cloudinary). */
export function removedImagePublicIds(before: MenuExtras, after: MenuExtras): string[] {
  const ids = (m: MenuExtras) => m.blocks.flatMap((b) => b.items.map((i) => i.imagePublicId).filter(Boolean)) as string[];
  const kept = new Set(ids(after));
  return ids(before).filter((id) => !kept.has(id));
}

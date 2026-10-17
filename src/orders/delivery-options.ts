import { BadRequestException } from '@nestjs/common';

/**
 * Entrega de los pedidos del MarketPlace: a domicilio (con un valor que fija la
 * tienda) o para recoger en el local. Funciones puras (delivery-options.spec.ts).
 *
 * El valor del domicilio lo pone el servidor desde la configuración de la
 * tienda (nunca el navegador), se suma al total del pedido y es el valor
 * mínimo con el que el negocio publica el domicilio en Shotra. Lo recauda la
 * tienda para su domiciliario.
 *
 * Domicilio por zona: la tienda lista sus sitios de entrega con su valor
 * (Turbaco $5.000, Bonanza $1.500…) y el cliente elige el suyo. Si un sitio
 * tiene dos precios, la tienda crea dos zonas ("Bonanza (cerca)", "Bonanza
 * (lejos)"). Sin zonas, el domicilio vale lo mismo en todas partes.
 */

export type Fulfillment = 'DELIVERY' | 'PICKUP';
export const FULFILLMENTS: Fulfillment[] = ['DELIVERY', 'PICKUP'];

/** Sitio de entrega con su valor ("Turbaco", 5000). */
export interface DeliveryZone {
  name: string;
  /** Valor del domicilio a esta zona en pesos (0 = gratis). */
  fee: number;
}

export interface DeliveryOptions {
  /** La tienda entrega a domicilio. */
  deliveryEnabled: boolean;
  /** Valor del domicilio en pesos (0 = gratis). Con zonas: el de "otra zona". */
  deliveryFee: number;
  /** Zonas de entrega con su valor; vacío = el mismo valor en todas partes. */
  zones: DeliveryZone[];
  /** Con zonas: acepta direcciones fuera de la lista ("Otra zona", por deliveryFee). */
  otherZones: boolean;
  /** El cliente puede recoger en el local. */
  pickupEnabled: boolean;
  /** Dirección del local para recoger (obligatoria si pickupEnabled). */
  pickupAddress: string;
  /** Indicaciones para recoger ("timbre 2", "horario de recogida"…). */
  pickupNotes: string;
}

/** Tiendas sin configurar: domicilio sin costo, como funcionaban hasta ahora. */
export const DEFAULT_DELIVERY_OPTIONS: DeliveryOptions = {
  deliveryEnabled: true,
  deliveryFee: 0,
  zones: [],
  otherZones: true,
  pickupEnabled: false,
  pickupAddress: '',
  pickupNotes: '',
};

export const MAX_DELIVERY_FEE = 1_000_000;
export const DELIVERY_ZONE_LIMITS = { zones: 50, name: 60 };
/** Lo que envía el checkout cuando la dirección no está en la lista de zonas. */
export const OTHER_ZONE = '__other__';
/** Cómo queda guardada en el pedido una dirección fuera de la lista. */
export const OTHER_ZONE_LABEL = 'Otra zona';
const MIN_ADDRESS_LENGTH = 5;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const money = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_DELIVERY_FEE) : 0;
};
const zoneKey = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Zonas válidas: con nombre, sin repetir (sin importar mayúsculas ni tildes), con tope. */
function resolveZones(raw: unknown): DeliveryZone[] {
  const seen = new Set<string>();
  const zones: DeliveryZone[] = [];
  for (const z of Array.isArray(raw) ? raw : []) {
    const name = text((z as any)?.name, DELIVERY_ZONE_LIMITS.name);
    if (!name || seen.has(zoneKey(name))) continue;
    seen.add(zoneKey(name));
    zones.push({ name, fee: money((z as any)?.fee) });
    if (zones.length >= DELIVERY_ZONE_LIMITS.zones) break;
  }
  return zones;
}

/**
 * Lo guardado (o lo enviado) → opciones completas; tolera datos viejos o parciales.
 * `legacyZones`: las zonas que la tienda escribió en la carta antes de que
 * tuvieran precio (menuExtras.deliveryZones); mientras no guarde zonas propias
 * se usan con el valor del domicilio, así ninguna tienda pierde lo configurado.
 */
export function resolveDeliveryOptions(raw: any, legacyZones?: string[] | null): DeliveryOptions {
  const src = raw && typeof raw === 'object' ? raw : {};
  const deliveryFee = money(src.deliveryFee);
  const zones = Array.isArray(src.zones)
    ? resolveZones(src.zones)
    : resolveZones((legacyZones || []).map((name) => ({ name, fee: deliveryFee })));
  return {
    deliveryEnabled: src.deliveryEnabled !== false,
    deliveryFee,
    zones,
    otherZones: src.otherZones !== false,
    pickupEnabled: src.pickupEnabled === true,
    pickupAddress: text(src.pickupAddress, 200),
    pickupNotes: text(src.pickupNotes, 300),
  };
}

/** Valida lo que guarda la tienda: al menos una modalidad, y dirección si se recoge. */
export function validateDeliveryOptions(raw: any): DeliveryOptions {
  const opts = resolveDeliveryOptions(raw);
  const fee = Number(raw?.deliveryFee);
  if (raw?.deliveryFee != null && (!Number.isFinite(fee) || fee < 0 || fee > MAX_DELIVERY_FEE)) {
    throw new BadRequestException(`El valor del domicilio debe estar entre $0 y $${MAX_DELIVERY_FEE.toLocaleString('es-CO')}.`);
  }
  if (!opts.deliveryEnabled && !opts.pickupEnabled) {
    throw new BadRequestException('Activa al menos una forma de entrega: a domicilio o recoger en la tienda.');
  }
  if (opts.pickupEnabled && opts.pickupAddress.length < MIN_ADDRESS_LENGTH) {
    throw new BadRequestException('Escribe la dirección del local donde el cliente recoge su pedido.');
  }
  const sent = Array.isArray(raw?.zones) ? raw.zones : [];
  if (sent.length > DELIVERY_ZONE_LIMITS.zones) {
    throw new BadRequestException(`Puedes tener hasta ${DELIVERY_ZONE_LIMITS.zones} zonas de entrega.`);
  }
  const names = new Set<string>();
  for (const z of sent) {
    const name = text(z?.name, DELIVERY_ZONE_LIMITS.name);
    const fee = Number(z?.fee);
    if (!name) throw new BadRequestException('Cada zona de entrega necesita un nombre.');
    if (names.has(zoneKey(name))) throw new BadRequestException(`La zona "${name}" está repetida.`);
    names.add(zoneKey(name));
    if (z?.fee == null || z?.fee === '' || !Number.isFinite(fee) || fee < 0 || fee > MAX_DELIVERY_FEE) {
      throw new BadRequestException(`El valor del domicilio a "${name}" debe estar entre $0 y $${MAX_DELIVERY_FEE.toLocaleString('es-CO')}.`);
    }
  }
  return opts;
}

export interface FulfillmentResult {
  fulfillment: Fulfillment | null;
  /** Valor del domicilio a sumar al total (0 si recoge). */
  deliveryFee: number;
  /** Dirección del pedido (null si recoge). */
  address: string | null;
  /** Zona de entrega elegida (null si la tienda no usa zonas o si recoge). */
  zone: string | null;
}

/**
 * Modalidad del pedido según lo que eligió el cliente y lo que ofrece la tienda.
 * - Sin modalidad (navegador anterior a esta función): como antes, sin cargo y
 *   la dirección sigue siendo opcional.
 * - A domicilio: la tienda debe ofrecerlo y la dirección es obligatoria. Si la
 *   tienda tiene zonas, el cliente elige la suya y se cobra su valor; fuera de
 *   la lista (OTHER_ZONE) solo si la tienda lo acepta, por el valor general.
 * - Recoger: la tienda debe ofrecerlo; no lleva dirección ni cargo.
 */
export function resolveFulfillment(
  requested: string | null | undefined,
  address: string | null | undefined,
  options: DeliveryOptions,
  zone?: string | null,
): FulfillmentResult {
  const addr = (address || '').trim();
  if (!requested) return { fulfillment: null, deliveryFee: 0, address: addr || null, zone: null };

  if (requested === 'PICKUP') {
    if (!options.pickupEnabled) throw new BadRequestException('Esta tienda no tiene recogida en el local. Elige entrega a domicilio.');
    return { fulfillment: 'PICKUP', deliveryFee: 0, address: null, zone: null };
  }
  if (requested === 'DELIVERY') {
    if (!options.deliveryEnabled) throw new BadRequestException('Esta tienda no hace domicilios. Elige recoger en la tienda.');
    if (addr.length < MIN_ADDRESS_LENGTH) {
      throw new BadRequestException('Escribe la dirección de entrega: es obligatoria para los pedidos a domicilio.');
    }
    if (!options.zones.length) return { fulfillment: 'DELIVERY', deliveryFee: options.deliveryFee, address: addr, zone: null };

    const chosen = (zone || '').trim();
    if (!chosen) throw new BadRequestException('Elige la zona de entrega: el valor del domicilio depende de ella.');
    const match = chosen === OTHER_ZONE ? undefined : options.zones.find((z) => zoneKey(z.name) === zoneKey(chosen));
    if (match) return { fulfillment: 'DELIVERY', deliveryFee: match.fee, address: addr, zone: match.name };
    if (options.otherZones) return { fulfillment: 'DELIVERY', deliveryFee: options.deliveryFee, address: addr, zone: OTHER_ZONE_LABEL };
    throw new BadRequestException('La tienda no hace domicilios a esa zona. Elige una de la lista o recoge en la tienda.');
  }
  throw new BadRequestException('Forma de entrega no válida.');
}

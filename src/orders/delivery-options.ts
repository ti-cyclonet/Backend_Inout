import { BadRequestException } from '@nestjs/common';

/**
 * Entrega de los pedidos del MarketPlace: a domicilio (con un valor que fija la
 * tienda) o para recoger en el local. Funciones puras (delivery-options.spec.ts).
 *
 * El valor del domicilio lo pone el servidor desde la configuración de la
 * tienda (nunca el navegador), se suma al total del pedido y es el presupuesto
 * con el que el negocio publica el domicilio en Shotra.
 */

export type Fulfillment = 'DELIVERY' | 'PICKUP';
export const FULFILLMENTS: Fulfillment[] = ['DELIVERY', 'PICKUP'];

export interface DeliveryOptions {
  /** La tienda entrega a domicilio. */
  deliveryEnabled: boolean;
  /** Valor del domicilio en pesos (0 = gratis). */
  deliveryFee: number;
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
  pickupEnabled: false,
  pickupAddress: '',
  pickupNotes: '',
};

export const MAX_DELIVERY_FEE = 1_000_000;
const MIN_ADDRESS_LENGTH = 5;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Lo guardado (o lo enviado) → opciones completas; tolera datos viejos o parciales. */
export function resolveDeliveryOptions(raw: any): DeliveryOptions {
  const src = raw && typeof raw === 'object' ? raw : {};
  const fee = Math.round(Number(src.deliveryFee));
  return {
    deliveryEnabled: src.deliveryEnabled !== false,
    deliveryFee: Number.isFinite(fee) ? Math.min(Math.max(fee, 0), MAX_DELIVERY_FEE) : 0,
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
  return opts;
}

export interface FulfillmentResult {
  fulfillment: Fulfillment | null;
  /** Valor del domicilio a sumar al total (0 si recoge). */
  deliveryFee: number;
  /** Dirección del pedido (null si recoge). */
  address: string | null;
}

/**
 * Modalidad del pedido según lo que eligió el cliente y lo que ofrece la tienda.
 * - Sin modalidad (navegador anterior a esta función): como antes, sin cargo y
 *   la dirección sigue siendo opcional.
 * - A domicilio: la tienda debe ofrecerlo y la dirección es obligatoria.
 * - Recoger: la tienda debe ofrecerlo; no lleva dirección ni cargo.
 */
export function resolveFulfillment(
  requested: string | null | undefined,
  address: string | null | undefined,
  options: DeliveryOptions,
): FulfillmentResult {
  const addr = (address || '').trim();
  if (!requested) return { fulfillment: null, deliveryFee: 0, address: addr || null };

  if (requested === 'PICKUP') {
    if (!options.pickupEnabled) throw new BadRequestException('Esta tienda no tiene recogida en el local. Elige entrega a domicilio.');
    return { fulfillment: 'PICKUP', deliveryFee: 0, address: null };
  }
  if (requested === 'DELIVERY') {
    if (!options.deliveryEnabled) throw new BadRequestException('Esta tienda no hace domicilios. Elige recoger en la tienda.');
    if (addr.length < MIN_ADDRESS_LENGTH) {
      throw new BadRequestException('Escribe la dirección de entrega: es obligatoria para los pedidos a domicilio.');
    }
    return { fulfillment: 'DELIVERY', deliveryFee: options.deliveryFee, address: addr };
  }
  throw new BadRequestException('Forma de entrega no válida.');
}

/**
 * Textos de la modal de agradecimiento que ve el cliente en el seguimiento
 * cuando su pedido se entrega. La tienda los configura en el MarketPlace
 * (modo administrador). Funciones puras.
 *
 * Marcadores: {nombre} = primer nombre del cliente, {pedido} = código del pedido.
 */

export interface ThanksMessages {
  /** false = no se muestra la modal de agradecimiento. */
  enabled: boolean;
  kicker: string;
  title: string;
  message: string;
  signature: string;
  buttonText: string;
  closeText: string;
}

export const DEFAULT_THANKS_MESSAGES: ThanksMessages = {
  enabled: true,
  kicker: 'Pedido {pedido} · entregado',
  title: '¡Gracias por tu compra, {nombre}!',
  message:
    'Tu pedido llegó a su destino. Lo preparamos con mucho cuidado y esperamos que lo disfrutes tanto como nosotros disfrutamos hacerlo.',
  signature: 'Con cariño, el equipo de la tienda ♥',
  buttonText: 'Volver a comprar',
  closeText: 'Cerrar',
};

/** Largo máximo de cada texto. */
export const THANKS_MAX_LENGTH: Record<Exclude<keyof ThanksMessages, 'enabled'>, number> = {
  kicker: 80,
  title: 120,
  message: 600,
  signature: 120,
  buttonText: 40,
  closeText: 30,
};

/** Normaliza lo guardado (o lo enviado): texto vacío o ausente = texto por defecto. */
export function resolveThanksMessages(raw: any): ThanksMessages {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out: ThanksMessages = { ...DEFAULT_THANKS_MESSAGES, enabled: src.enabled !== false };
  for (const key of Object.keys(THANKS_MAX_LENGTH) as (keyof typeof THANKS_MAX_LENGTH)[]) {
    const value = typeof src[key] === 'string' ? src[key].trim().slice(0, THANKS_MAX_LENGTH[key]) : '';
    out[key] = value || DEFAULT_THANKS_MESSAGES[key];
  }
  return out;
}

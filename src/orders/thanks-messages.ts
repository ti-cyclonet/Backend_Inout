/**
 * Textos de la modal de agradecimiento que ve el cliente en el seguimiento
 * cuando su pedido se entrega. La tienda los configura en el MarketPlace
 * (modo administrador). Funciones puras.
 *
 * Marcadores: {nombre} = primer nombre del cliente, {pedido} = código del pedido.
 */

/** Diseño de la tarjeta: clásico (franja de color), postal (papel) o nocturno (oscuro). */
export const THANKS_STYLES = ['clasico', 'postal', 'nocturno'] as const;
export type ThanksStyle = (typeof THANKS_STYLES)[number];

export interface ThanksMessages {
  /** false = no se muestra la modal de agradecimiento. */
  enabled: boolean;
  style: ThanksStyle;
  kicker: string;
  title: string;
  message: string;
  signature: string;
  buttonText: string;
  closeText: string;
}

export const DEFAULT_THANKS_MESSAGES: ThanksMessages = {
  enabled: true,
  style: 'clasico',
  kicker: 'Pedido {pedido} · entregado',
  title: '¡Gracias por tu compra, {nombre}!',
  message:
    'Tu pedido llegó a su destino. Lo preparamos con mucho cuidado y esperamos que lo disfrutes tanto como nosotros disfrutamos hacerlo.',
  signature: 'Con cariño, el equipo de la tienda ♥',
  buttonText: 'Volver a comprar',
  closeText: 'Cerrar',
};

/** Campos de texto de la tarjeta (todos menos el interruptor y el estilo). */
export type ThanksTextKey = Exclude<keyof ThanksMessages, 'enabled' | 'style'>;

/** Largo máximo de cada texto. */
export const THANKS_MAX_LENGTH: Record<ThanksTextKey, number> = {
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
  const out: ThanksMessages = {
    ...DEFAULT_THANKS_MESSAGES,
    enabled: src.enabled !== false,
    style: THANKS_STYLES.includes(src.style) ? src.style : DEFAULT_THANKS_MESSAGES.style,
  };
  for (const key of Object.keys(THANKS_MAX_LENGTH) as ThanksTextKey[]) {
    const value = typeof src[key] === 'string' ? src[key].trim().slice(0, THANKS_MAX_LENGTH[key]) : '';
    out[key] = value || DEFAULT_THANKS_MESSAGES[key];
  }
  return out;
}

/**
 * Referencia de un soporte de pago (volante, comprobante de transferencia,
 * Nequi…): una misma referencia no se puede usar en dos transacciones.
 * Funciones puras (payment-reference.spec.ts).
 */

/** Dónde se usó una referencia. */
export type ReferenceSource = 'VENTA' | 'PEDIDO' | 'CARTERA' | 'COMPROBANTE_CARTERA' | 'RESERVA';

export interface ReferenceUse {
  source: ReferenceSource;
  id: string;
  /** "la venta SC-F-00231", "el pedido SC-PD-00012"… */
  label: string;
  date: Date | string | null;
}

/** Referencias más cortas no se comparan (p. ej. "1", "OK"). */
export const MIN_REFERENCE_LENGTH = 4;

/**
 * Forma comparable: mayúsculas, sin espacios, guiones, puntos ni símbolos, y
 * sin prefijos como "Ref.", "No." o "#". "ref: m-8721 4093" → "M87214093".
 * Vacío si queda muy corta para compararla.
 */
export function normalizeReference(raw: unknown): string {
  let s = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .trim();
  // Prefijos ("Ref.", "No. ", "#"): solo con separador, para no recortar una referencia que empiece por "NO"
  s = s.replace(/^(?:(?:REFERENCIA|REF|NUMERO|NRO|NO|N[°º])(?:\s*[.:#°º-]+\s*|\s+)|#\s*)/u, '');
  s = s.replace(/[^A-Z0-9]/g, '');
  return s.length >= MIN_REFERENCE_LENGTH ? s : '';
}

const SOURCE_TEXT: Record<ReferenceSource, string> = {
  VENTA: 'la venta',
  PEDIDO: 'un pago del pedido',
  CARTERA: 'un abono de la cuenta',
  COMPROBANTE_CARTERA: 'un comprobante de la cuenta',
  RESERVA: 'el anticipo de la reserva',
};

export function useLabel(source: ReferenceSource, code: string | null | undefined): string {
  return `${SOURCE_TEXT[source]}${code ? ' ' + code : ''}`;
}

/** Lo que sube el cliente debe traer la referencia (la lee el OCR o la escribe). */
export const REFERENCE_REQUIRED_MESSAGE = 'Escribe el número de referencia del comprobante.';

/** Mensaje para quien intenta reutilizar el soporte. */
export function duplicateMessage(reference: string, use: ReferenceUse): string {
  const d = use.date ? new Date(use.date) : null;
  const when = d && !isNaN(d.getTime())
    ? ` del ${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })}`
    : '';
  return `Este soporte de pago ya se usó: la referencia ${reference} está registrada en ${use.label}${when}. Un mismo soporte no se puede usar en dos transacciones.`;
}

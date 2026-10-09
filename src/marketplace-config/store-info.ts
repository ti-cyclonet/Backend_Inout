/**
 * Datos de contacto de la tienda en el MarketPlace: WhatsApp y mensaje de
 * bienvenida. La tienda los configura en el modo administrador; la carta y el
 * encabezado de la tienda los muestran. Funciones puras.
 */

export interface StoreInfo {
  /** Celular colombiano de 10 dígitos (3XXXXXXXXX), o '' si no tiene. */
  whatsapp: string;
  welcomeMessage: string;
}

/** Largo máximo del mensaje de bienvenida (la columna admite 500). */
export const WELCOME_MAX_LENGTH = 300;

/**
 * Normaliza un número de WhatsApp a 10 dígitos. Acepta espacios, guiones,
 * paréntesis y el indicativo +57. Vacío → ''. Inválido → null.
 */
export function normalizeWhatsapp(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
  return /^3\d{9}$/.test(local) ? local : null;
}

/** Lo guardado en marketplace_config → lo que se publica. */
export function storeInfoFrom(config: { whatsapp?: string | null; welcomeMessage?: string | null } | null): StoreInfo {
  return {
    whatsapp: normalizeWhatsapp(config?.whatsapp) || '',
    welcomeMessage: (config?.welcomeMessage || '').trim(),
  };
}

/**
 * Valida lo enviado por la tienda. Devuelve los datos normalizados o el
 * mensaje de error para el usuario.
 */
export function validateStoreInfo(body: any): { ok: true; value: StoreInfo } | { ok: false; error: string } {
  const src = body && typeof body === 'object' ? body : {};
  const whatsapp = normalizeWhatsapp(src.whatsapp);
  if (whatsapp === null) {
    return { ok: false, error: 'El WhatsApp debe ser un celular colombiano de 10 dígitos que empiece por 3 (por ejemplo 300 120 5337).' };
  }
  const welcomeMessage = typeof src.welcomeMessage === 'string' ? src.welcomeMessage.trim() : '';
  if (welcomeMessage.length > WELCOME_MAX_LENGTH) {
    return { ok: false, error: `El mensaje de bienvenida admite hasta ${WELCOME_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, value: { whatsapp, welcomeMessage } };
}

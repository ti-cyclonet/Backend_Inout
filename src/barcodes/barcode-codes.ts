/** Máximo de códigos por ítem. */
export const MAX_CODES_PER_ITEM = 20;

/**
 * Normaliza lo que entrega el lector (o lo que se escribe a mano): quita
 * espacios y caracteres de control. Solo ASCII imprimible, de 3 a 64
 * caracteres (EAN/UPC, Code 128, Code 39…). Devuelve null si no es válido.
 */
export function normalizeCode(raw: unknown): string | null {
  const code = String(raw ?? '').replace(/[\s\u0000-\u001f\u007f]+/g, '');
  if (code.length < 3 || code.length > 64) return null;
  if (!/^[\x21-\x7e]+$/.test(code)) return null;
  return code;
}

/** Lista sin repetidos; `invalid` trae el primer código que no sirve. */
export function normalizeCodes(raw: unknown): { codes: string[]; invalid: string | null } {
  const list = Array.isArray(raw) ? raw : [];
  const codes: string[] = [];
  for (const item of list) {
    const code = normalizeCode(item);
    if (!code) return { codes: [], invalid: String(item ?? '') };
    if (!codes.includes(code)) codes.push(code);
  }
  return { codes, invalid: null };
}

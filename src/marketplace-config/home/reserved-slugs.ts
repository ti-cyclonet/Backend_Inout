/**
 * Slugs que no puede tomar una tienda: /marketplace/home es la vitrina de
 * CycloNet Market (el frontend la reconoce por ese nombre), así que una tienda
 * llamada "home" nunca se podría abrir.
 */
export const RESERVED_SLUGS = ['home', 'admin', 'marketplace', 'cyclonet-market'];

export const isReservedSlug = (slug: string | null | undefined): boolean =>
  RESERVED_SLUGS.includes((slug || '').trim().toLowerCase());

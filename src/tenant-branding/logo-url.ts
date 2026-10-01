/**
 * Variantes del logo servidas por Cloudinary (sin guardar copias):
 * se inserta una transformación después de `/upload/`.
 *
 * - `pdf`: PNG acotado a 400px. pdfmake y jsPDF solo aceptan PNG/JPEG, y un
 *   logo grande infla el tamaño del documento.
 * - `web`: formato y calidad automáticos (WebP/AVIF según el navegador).
 *
 * Si la URL no es de Cloudinary se devuelve tal cual.
 */
export function logoVariant(url: string | null | undefined, variant: 'pdf' | 'web'): string | null {
  if (!url) return null;
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i < 0) return url;
  const transform = variant === 'pdf' ? 'c_limit,w_400,h_400,f_png' : 'c_limit,w_600,h_600,f_auto,q_auto';
  return `${url.slice(0, i + marker.length)}${transform}/${url.slice(i + marker.length)}`;
}

/** Formatos aceptados al subir (SVG no: no se puede incrustar en PDF y puede llevar scripts). */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

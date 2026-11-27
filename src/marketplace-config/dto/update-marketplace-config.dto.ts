import { IsArray, IsOptional, IsString, IsIn, Matches, ValidateIf } from 'class-validator';

/** Nombre de paleta: minúsculas sin espacios ("rojo", "verde"). */
export const PALETTE_PATTERN = /^[a-z]{2,20}$/;

/** Modos de visualización del catálogo (deben coincidir con grid-themes.ts y MENU_VARIANTS del frontend). */
// La columna admite 10 caracteres: por eso Boutique se guarda como grid-chic.
// Minorista (comercio minorista): grid-rosa, grid-rojo y grid-azul (mismo diseño, tres paletas).
export const DISPLAY_MODES = ['grid', 'grid-fresh', 'grid-chic', 'grid-rosa', 'grid-rojo', 'grid-azul', 'menu', 'menu-chalk', 'menu-clean'];

export class UpdateMarketplaceConfigDto {
  @IsString()
  tenantId: string;

  /** Ya no se edita en la tienda (la visibilidad va en cada producto); se conserva por compatibilidad. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedProductIds?: string[];

  @IsOptional()
  @IsString()
  // Tarjetas: grid = Nocturno, grid-fresh = Fresco, grid-chic = Boutique, grid-rosa|rojo|azul = Minorista.
  // Menú: menu = Póster, menu-chalk = Pizarra, menu-clean = Elegante.
  @IsIn(DISPLAY_MODES)
  displayMode?: string;

  /**
   * Paleta del tema (la lista por tema vive en el frontend: theme-palettes.ts).
   * '' o null vuelve a la paleta original del tema.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(PALETTE_PATTERN, { message: 'Paleta no válida.' })
  palette?: string | null;
}
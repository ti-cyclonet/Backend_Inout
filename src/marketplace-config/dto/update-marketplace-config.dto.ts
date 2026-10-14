import { IsArray, IsOptional, IsString, IsIn } from 'class-validator';

/** Modos de visualización del catálogo (deben coincidir con grid-themes.ts y MENU_VARIANTS del frontend). */
// La columna admite 10 caracteres: por eso Boutique se guarda como grid-chic.
export const DISPLAY_MODES = ['grid', 'grid-fresh', 'grid-chic', 'menu', 'menu-chalk', 'menu-clean'];

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
  // Tarjetas: grid = Nocturno, grid-fresh = Fresco, grid-chic = Boutique.
  // Menú: menu = Póster, menu-chalk = Pizarra, menu-clean = Elegante.
  @IsIn(DISPLAY_MODES)
  displayMode?: string;
}
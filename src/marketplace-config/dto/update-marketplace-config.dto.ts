import { IsArray, IsOptional, IsString, IsIn } from 'class-validator';

/** Modos de visualización del catálogo (deben coincidir con grid-themes.ts y MENU_VARIANTS del frontend). */
export const DISPLAY_MODES = ['grid', 'grid-fresh', 'grid-boutique', 'menu', 'menu-chalk', 'menu-clean'];

export class UpdateMarketplaceConfigDto {
  @IsString()
  tenantId: string;

  @IsArray()
  @IsString({ each: true })
  selectedProductIds: string[];

  @IsOptional()
  @IsString()
  // Tarjetas: grid = Nocturno, grid-fresh = Fresco, grid-boutique = Boutique.
  // Menú: menu = Póster, menu-chalk = Pizarra, menu-clean = Elegante.
  @IsIn(DISPLAY_MODES)
  displayMode?: string;
}
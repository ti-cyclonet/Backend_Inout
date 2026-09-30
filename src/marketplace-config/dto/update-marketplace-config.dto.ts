import { IsArray, IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateMarketplaceConfigDto {
  @IsString()
  tenantId: string;

  @IsArray()
  @IsString({ each: true })
  selectedProductIds: string[];

  @IsOptional()
  @IsString()
  // menu = Póster, menu-chalk = Pizarra, menu-clean = Elegante
  @IsIn(['grid', 'menu', 'menu-chalk', 'menu-clean'])
  displayMode?: string;
}
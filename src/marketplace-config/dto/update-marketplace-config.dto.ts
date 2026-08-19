import { IsArray, IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateMarketplaceConfigDto {
  @IsString()
  tenantId: string;

  @IsArray()
  @IsString({ each: true })
  selectedProductIds: string[];

  @IsOptional()
  @IsString()
  @IsIn(['grid', 'menu'])
  displayMode?: string;
}
import { IsArray, IsString } from 'class-validator';

export class UpdateMarketplaceConfigDto {
  @IsString()
  tenantId: string;

  @IsArray()
  @IsString({ each: true })
  selectedProductIds: string[];
}
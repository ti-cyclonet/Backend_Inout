import { IsInt, IsOptional, IsString, IsNumber, IsBoolean, Min, MaxLength } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  strName: string;

  @IsInt()
  ingQuantity: number;

  @IsNumber()
  fltPrice: number;

  @IsString()
  @IsOptional()
  strDescription?: string;

  @IsInt()
  ingMaxStock: number;

  @IsInt()
  ingMinStock: number;

  @IsString()
  strUnitMeasure: string;

  @IsString()
  strDischargeUnit: string;

  @IsString()
  @IsOptional()
  dtmCreationDate?: string;

  @IsString()
  strStatus: string;

  @IsString()
  @IsOptional()
  strUrlImage?: string;

  @IsString()
  @IsOptional()
  strLocation?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number;

  @IsOptional()
  images?: any[]; // Array de imágenes para procesar

  @IsOptional()
  blnBulkUpload?: boolean;

  @IsBoolean()
  @IsOptional()
  blnMarketplaceVisible?: boolean;

  @IsBoolean()
  @IsOptional()
  blnForResale?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  strSalePresentation?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  fltPresentationQuantity?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  fltSalePrice?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  ingPlannedMonthlyUnits?: number;
}

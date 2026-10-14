import { IsInt, IsOptional, IsString, IsNumber, IsBoolean, Min, Max, MaxLength } from 'class-validator';

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

  /** Unidades que trae cada paquete o caja (null = no aplica). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  intPackSize?: number | null;

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

  /** Margen propio (sobre el costo, 0–1000 %); null o vacío = heredar. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  fltMarginPercent?: number | null;

  @IsInt()
  @IsOptional()
  @Min(0)
  ingPlannedMonthlyUnits?: number;
}

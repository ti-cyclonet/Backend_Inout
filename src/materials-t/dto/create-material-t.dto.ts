import { IsInt, IsOptional, IsString, IsNumber, IsArray, IsBoolean, ValidateNested, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CompositionDto {
  @IsString()
  componentMaterialId: string;

  @IsNumber()
  quantity: number;
}

export class CreateMaterialTDto {
  @IsString()
  strName: string;

  @IsNumber()
  @IsOptional()
  ingQuantity?: number;

  @IsNumber()
  @IsOptional()
  fltPrice?: number;

  @IsString()
  @IsOptional()
  strDescription?: string;

  @IsNumber()
  @IsOptional()
  ingMaxStock?: number;

  @IsNumber()
  @IsOptional()
  ingMinStock?: number;

  @IsString()
  strUnitMeasure: string;

  @IsString()
  @IsOptional()
  strDischargeUnit?: string;

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
  @IsOptional()
  strStatus?: string;

  @IsString()
  @IsOptional()
  strLocation?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionDto)
  @IsOptional()
  composition?: CompositionDto[];

  @IsArray()
  @IsOptional()
  images?: any[];

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

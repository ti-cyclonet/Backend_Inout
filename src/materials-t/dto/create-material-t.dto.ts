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

  /** Al crear: cantidad a producir ahora (en strUnitMeasure). */
  @IsNumber()
  @IsOptional()
  ingQuantity?: number;

  /** Cuánto rinde la receta (las cantidades de `composition`), en strUnitMeasure. */
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  fltRecipeYield?: number;

  /** Mano de obra de una tanda de la receta ($). */
  @IsNumber()
  @IsOptional()
  @Min(0)
  fltRecipeLaborCost?: number;

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

/** Producir más de un compuesto con su receta. */
export class ProduceMaterialTDto {
  /** Cantidad a producir, en la unidad de medida del compuesto. */
  @IsNumber()
  @Min(0.001)
  quantity: number;

  /** Fecha del movimiento (YYYY-MM-DD); por defecto hoy. */
  @IsString()
  @IsOptional()
  date?: string;
}

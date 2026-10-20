import { IsString, IsInt, IsNumber, IsOptional, IsArray, IsBoolean, ValidateNested, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

class CompositionTwoDto {
  @IsString()
  componentMaterialId: string;

  @IsNumber()
  quantity: number;
}

class CompositionThreeDto {
  @IsString()
  componentTransformedMaterialId: string;

  @IsNumber()
  quantity: number;
}

/** Nueva presentación de venta a partir de un producto (copia su receta). */
export class CreatePresentationDto {
  /** Presentación nueva, ej. "12 oz". */
  @IsString()
  @MaxLength(40)
  label: string;

  /** Presentación del producto de origen si aún no la tiene, ej. "8 oz". */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  sourceLabel?: string;

  /** Nombre del producto nuevo; por defecto el de la familia + la presentación. */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;
}

export class CreateProductDto {
  @IsString()
  strName: string;

  @IsString()
  @IsOptional()
  strDescription?: string;

  @IsNumber()
  fltPrice: number;

  @IsNumber()
  @IsOptional()
  fltCost?: number;

  @IsNumber()
  @IsOptional()
  fltDirectLaborCost?: number;

  @IsString()
  strMeasurementUnit: string;

  @IsNumber()
  @IsOptional()
  ingStockMin?: number;

  @IsNumber()
  @IsOptional()
  ingStockMax?: number;

  @IsString()
  @IsOptional()
  strLocation?: string;

  @IsArray()
  @IsOptional()
  composition?: Array<{ materialId: string; quantity: number }>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionTwoDto)
  @IsOptional()
  compositionTwo?: CompositionTwoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionThreeDto)
  @IsOptional()
  compositionThree?: CompositionThreeDto[];

  @IsArray()
  images: any[];

  @IsNumber()
  categoryId: number;

  @IsBoolean()
  @IsOptional()
  blnMarketplaceVisible?: boolean;

  /** Fabricación bajo pedido: se puede pedir sin stock. */
  @IsBoolean()
  @IsOptional()
  blnMadeToOrder?: boolean;

  /** Horas que toma fabricarlo. */
  @IsNumber()
  @IsOptional()
  intProductionLeadHours?: number;

  /** Minutos que toma fabricarlo (reemplaza a las horas). */
  @IsNumber()
  @IsOptional()
  @Min(0)
  intProductionLeadMinutes?: number | null;

  /** Unidades que salen en una tanda del tiempo de fabricación (mínimo 1). */
  @IsInt()
  @IsOptional()
  @Min(1)
  intUnitsPerBatch?: number;

  /** Listas de la carta de las que el cliente escoge (se normaliza en el servicio). */
  @IsArray()
  @IsOptional()
  jsonChoiceGroups?: { block: string; min: number; max: number }[];

  /** Margen propio (sobre el costo, 0–1000 %); null o vacío = heredar. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  fltMarginPercent?: number | null;

  /** Familia de presentaciones (id del producto principal) y nombre de la presentación. */
  @IsString()
  @IsOptional()
  strVariantGroupId?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  strVariantLabel?: string | null;
}

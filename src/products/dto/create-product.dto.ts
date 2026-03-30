import { IsString, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
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

export class CreateProductDto {
  @IsString()
  strName: string;

  @IsString()
  @IsOptional()
  strDescription?: string;

  @IsNumber()
  fltPrice: number;

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
}

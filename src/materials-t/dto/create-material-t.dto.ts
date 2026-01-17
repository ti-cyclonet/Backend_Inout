import { IsInt, IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
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
  dtmCreationDate?: string;

  @IsString()
  @IsOptional()
  strStatus?: string;

  @IsString()
  @IsOptional()
  strLocation?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionDto)
  @IsOptional()
  composition?: CompositionDto[];
}

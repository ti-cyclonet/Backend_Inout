import { IsInt, IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateMaterialTDto {
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
}

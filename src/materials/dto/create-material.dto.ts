import { IsInt, IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';

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
}

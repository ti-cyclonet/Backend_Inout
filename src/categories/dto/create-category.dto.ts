import { IsString, IsOptional, MaxLength, IsNumber, Min, Max } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status?: string;

  /** Margen propio (sobre el costo, 0–1000 %); null o vacío = heredar. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  fltMarginPercent?: number | null;
}

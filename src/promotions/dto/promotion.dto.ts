import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class PromotionTargetDto {
  @IsIn(['product', 'material', 'material_t', 'kit', 'combo', 'category'])
  type: 'product' | 'material' | 'material_t' | 'kit' | 'combo' | 'category';

  @IsString()
  @MaxLength(64)
  id: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreatePromotionDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(['PERCENT', 'FIXED'])
  discountType: 'PERCENT' | 'FIXED';

  @IsNumber()
  @Min(0.01)
  value: number;

  @IsIn(['ITEMS', 'ALL'])
  scope: 'ITEMS' | 'ALL';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets?: PromotionTargetDto[];

  @IsOptional()
  @IsIn(['ALL', 'POS', 'MARKETPLACE'])
  channel?: 'ALL' | 'POS' | 'MARKETPLACE';

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[] | null;

  @IsOptional()
  @Matches(HHMM, { message: 'La hora de inicio debe tener el formato HH:MM' })
  timeFrom?: string | null;

  @IsOptional()
  @Matches(HHMM, { message: 'La hora de fin debe tener el formato HH:MM' })
  timeTo?: string | null;
}

export class UpdatePromotionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsIn(['PERCENT', 'FIXED']) discountType?: 'PERCENT' | 'FIXED';
  @IsOptional() @IsNumber() @Min(0.01) value?: number;
  @IsOptional() @IsIn(['ITEMS', 'ALL']) scope?: 'ITEMS' | 'ALL';
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PromotionTargetDto) targets?: PromotionTargetDto[];
  @IsOptional() @IsIn(['ALL', 'POS', 'MARKETPLACE']) channel?: 'ALL' | 'POS' | 'MARKETPLACE';
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays?: number[] | null;
  @IsOptional() @Matches(HHMM, { message: 'La hora de inicio debe tener el formato HH:MM' }) timeFrom?: string | null;
  @IsOptional() @Matches(HHMM, { message: 'La hora de fin debe tener el formato HH:MM' }) timeTo?: string | null;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}

/** Línea a cotizar (sin precio: lo pone el servidor). */
export class QuoteItemDto {
  @IsString()
  @MaxLength(64)
  productId: string;

  @IsOptional()
  @IsIn(['product', 'material', 'material_t', 'kit', 'combo'])
  itemType?: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class QuoteDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
}

export class MarketplaceQuoteDto extends QuoteDto {
  @IsString()
  @MaxLength(100)
  tenantId: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested, IsDateString,
} from 'class-validator';

export class ComboComponentDto {
  @IsIn(['product', 'material', 'material_t'])
  itemType: 'product' | 'material' | 'material_t';

  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  /** SALE (unidades/presentaciones, por defecto) o STOCK (unidad de medida; solo insumos de kits). */
  @IsOptional()
  @IsIn(['SALE', 'STOCK'])
  quantityMode?: 'SALE' | 'STOCK';
}

export class CreateComboDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(['VIRTUAL', 'KIT'])
  type: 'VIRTUAL' | 'KIT';

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  marketplaceVisible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboComponentDto)
  components: ComboComponentDto[];
}

export class UpdateComboDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsBoolean() marketplaceVisible?: boolean;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';

  /** Reemplaza todos los componentes (en un kit, solo si no hay unidades armadas). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboComponentDto)
  components?: ComboComponentDto[];
}

export class AssembleKitDto {
  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

import { IsString, IsNumber, IsNotEmpty, IsOptional, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseRecordDto {
  @IsString()
  @IsNotEmpty()
  materialId: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;

  @IsString()
  @IsOptional()
  document?: string;

  @IsDateString()
  @IsOptional()
  expirationDate?: string;
}

export class BulkPurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  materialId: string;

  @IsString()
  @IsOptional()
  materialName?: string;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;

  @IsDateString()
  @IsOptional()
  expirationDate?: string;
}

export class CreateBulkPurchaseDto {
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  document: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkPurchaseItemDto)
  items: BulkPurchaseItemDto[];
}

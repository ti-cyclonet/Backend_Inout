import { IsString, IsOptional, IsArray, IsNumber, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MarketplaceOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  subtotal: number;
}

export class CreateMarketplaceOrderDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketplaceOrderItemDto)
  items: MarketplaceOrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNumber()
  subtotal: number;

  @IsNumber()
  tax: number;

  @IsNumber()
  total: number;
}

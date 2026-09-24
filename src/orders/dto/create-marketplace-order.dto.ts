import { IsString, IsOptional, IsArray, IsNumber, IsNotEmpty, ValidateNested, IsIn } from 'class-validator';
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

  /** 'product' (default) o material de reventa ('material' | 'material_t'). */
  @IsOptional()
  @IsIn(['product', 'material', 'material_t'])
  itemType?: string;
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

  /** Opcional: si se da, el checkout de invitado queda registrado en
   * Authoriza como cliente potencial (pendiente de registro), no solo como
   * texto libre dentro del pedido. */
  @IsOptional()
  @IsString()
  customerEmail?: string;

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

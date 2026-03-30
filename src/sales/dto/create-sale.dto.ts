import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateSaleDto {
  @IsString()
  strTenantId: string;

  @IsString()
  strProductId: string;

  @IsDateString()
  dtmDate: string;

  @IsNumber()
  fltQuantity: number;

  @IsNumber()
  fltUnitPrice: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  items?: any;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  tax?: number;

  @IsOptional()
  @IsNumber()
  total?: number;
}

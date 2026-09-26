import { IsString, IsOptional, IsArray, IsNumber, IsDateString, IsEnum, MaxLength, IsIn } from 'class-validator';
import { PAYMENT_METHODS } from '../../credit/entities/receivable-payment.entity';
import { OrderStatus } from '../entities/order.entity';

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsArray()
  items?: { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number; itemType?: string }[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  tax?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  total?: number;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  /** Obligatorio cuando status = CANCELLED. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Al facturar (INVOICED): forma de pago. CREDITO genera cuenta por cobrar. */
  @IsOptional()
  @IsIn(['CONTADO', 'CREDITO'])
  paymentType?: 'CONTADO' | 'CREDITO';

  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  paymentMethod?: string;
}

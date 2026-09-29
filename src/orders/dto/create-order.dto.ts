import { IsString, IsOptional, IsArray, IsNumber, IsDateString, IsEnum, MaxLength, IsIn, IsBoolean } from 'class-validator';
import { PAYMENT_METHODS } from '../../credit/entities/receivable-payment.entity';
import { OrderStatus } from '../entities/order.entity';

/** Franjas de un día para los ítems de un pedido del panel. */
export class OrderSlotsQueryDto {
  @IsString()
  date: string;

  @IsOptional()
  @IsArray()
  items?: { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number; itemType?: string }[];
}

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

  /** Entrega programada: inicio de la franja (ISO). En edición, null la quita. */
  @IsOptional()
  @IsString()
  scheduledStart?: string | null;

  /** Desde el panel: aceptar la franja aunque esté llena o no cumpla los tiempos. */
  @IsOptional()
  @IsBoolean()
  allowSlotOverride?: boolean;

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

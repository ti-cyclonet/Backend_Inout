import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../entities/order-payment.entity';

/** Pago de un pedido. Llega como JSON (panel) o multipart (comprobante del cliente). */
export class OrderPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsIn(PAYMENT_METHODS as unknown as string[])
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReviewOrderPaymentDto {
  @IsIn(['VERIFY', 'REJECT'])
  action: 'VERIFY' | 'REJECT';

  /** Obligatorio al rechazar. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

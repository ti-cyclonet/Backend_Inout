import { IsString, IsNumber, IsOptional, IsDateString, IsIn } from 'class-validator';
import { PAYMENT_METHODS } from '../../credit/entities/receivable-payment.entity';

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
  @IsString()
  customerId?: string;

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

  @IsOptional()
  @IsNumber()
  discount?: number;

  /** Forma de pago: CONTADO (default) o CREDITO (requiere customerId con crédito aprobado). */
  @IsOptional()
  @IsIn(['CONTADO', 'CREDITO'])
  paymentType?: 'CONTADO' | 'CREDITO';

  /** Medio de pago de contado. */
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  paymentMethod?: string;
}

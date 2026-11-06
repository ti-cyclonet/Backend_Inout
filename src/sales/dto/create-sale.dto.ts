import { IsString, IsNumber, IsOptional, IsDateString, IsIn, IsNotEmpty, MaxLength, IsArray, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../../credit/entities/receivable-payment.entity';

/** Una parte de un pago de contado dividido. */
export class SalePaymentPartDto {
  @IsIn(PAYMENT_METHODS as unknown as string[])
  method: string;

  @IsNumber()
  amount: number;
}

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

  /** Pago de contado dividido en varios medios (ej. efectivo + transferencia). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentPartDto)
  payments?: SalePaymentPartDto[];
}

export class SendReceiptEmailDto {
  @IsString()
  @MaxLength(254)
  email: string;

  /** Tiquete en PDF (base64), hasta 2 MB. */
  @IsString()
  @MaxLength(2_800_000)
  pdfBase64: string;
}

export class VoidSaleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

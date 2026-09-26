import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, IsDateString } from 'class-validator';
import { PAYMENT_METHODS } from '../entities/receivable-payment.entity';

export class CreateCreditRequestDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  customerName: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsNumber()
  @Min(1)
  requestedAmount: number;

  @IsInt()
  @Min(1)
  @Max(365)
  requestedTermDays: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ValidateCreditDto {
  @IsBoolean()
  identityVerified: boolean;

  @IsBoolean()
  referencesVerified: boolean;

  @IsBoolean()
  paymentCapacityVerified: boolean;

  /** true = cumple y pasa a asignación de cupo; false = se rechaza. */
  @IsBoolean()
  meetsRequirements: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}

export class AssignCreditLimitDto {
  @IsNumber()
  @Min(1)
  limit: number;

  /** Condición de pago del cliente (días de plazo). */
  @IsInt()
  @Min(1)
  @Max(365)
  termDays: number;
}

export class DecideCreditDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SuspendCreditDto {
  @IsBoolean()
  suspended: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RegisterPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(PAYMENT_METHODS as unknown as string[])
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class VoidReceivableDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsEmail, IsNumber } from 'class-validator';

export class CreateCustomerDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  documentDv?: string;

  @IsOptional()
  @IsString()
  personType?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsOptional()
  @IsString()
  firstSurname?: string;

  @IsOptional()
  @IsString()
  secondSurname?: string;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  sex?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

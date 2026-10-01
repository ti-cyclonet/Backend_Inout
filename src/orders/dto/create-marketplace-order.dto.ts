import { IsString, IsOptional, IsArray, IsNumber, IsNotEmpty, ValidateNested, IsIn, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_PLANS } from '../payment-plans';

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

  /** 'product' (default), material de reventa ('material' | 'material_t'),
   * kit armado ('kit') o combo virtual ('combo'). El precio lo pone el servidor. */
  @IsOptional()
  @IsIn(['product', 'material', 'material_t', 'kit', 'combo'])
  itemType?: string;
}

/** Franjas disponibles de un día para lo que hay en el carrito. */
export class MarketplaceSlotsQueryDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  /** 'YYYY-MM-DD' (hora de Colombia) */
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketplaceOrderItemDto)
  items?: MarketplaceOrderItemDto[];
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

  // Aceptación de Términos y Condiciones y autorización de Tratamiento de
  // Datos (Ley 1581/2012). Obligatoria para invitados (se valida en el
  // servicio); un cliente con sesión ya la dio al registrarse o al iniciar
  // sesión y queda probada en Authoriza (user_consents).
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptHabeasData?: boolean;

  @IsOptional()
  @IsString()
  termsVersion?: string;

  @IsOptional()
  @IsString()
  habeasDataVersion?: string;

  /** Solo con sesión de cliente: 'CREDITO' pide el pedido a crédito (se valida el cupo). */
  @IsOptional()
  @IsIn(['CONTADO', 'CREDITO'])
  paymentPreference?: 'CONTADO' | 'CREDITO';

  /** Pedido programado: inicio de la franja elegida (ISO). Sin él, "lo antes posible". */
  @IsOptional()
  @IsString()
  scheduledStart?: string;

  /** Forma de pago elegida (reemplaza a paymentPreference): debe estar activa en la tienda. */
  @IsOptional()
  @IsIn(PAYMENT_PLANS as unknown as string[])
  paymentPlan?: string;

  /** Ubicación exacta de entrega capturada con el GPS del comprador (opcional). */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  deliveryLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  deliveryLongitude?: number;
}

import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Module, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { OrdersModule } from '../orders/orders.module';
import { TenantPaymentAccount } from './tenant-payment-account.entity';
import { MercadoPagoClient } from './mercadopago.client';
import { OnlinePaymentsService } from './online-payments.service';

/** Pagos en línea del negocio: estado, aviso de disponibilidad y conexión de su cuenta de Mercado Pago. */
@Controller('online-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnlinePaymentsController {
  constructor(private readonly service: OnlinePaymentsService) {}

  @Get('status')
  @Roles('admin', 'operator')
  status(@GetTenantId() tenantId: string) {
    return this.service.status(tenantId);
  }

  @Post('notify-me')
  @Roles('admin')
  notifyMe(@GetTenantId() tenantId: string, @Body() body: { email?: string }, @Req() req: any) {
    return this.service.requestNotify(tenantId, body?.email || req.user?.email);
  }

  @Get('mercadopago/connect')
  @Roles('admin')
  connect(@GetTenantId() tenantId: string) {
    return this.service.connectUrl(tenantId);
  }

  @Post('mercadopago/disconnect')
  @Roles('admin')
  disconnect(@GetTenantId() tenantId: string) {
    return this.service.disconnect(tenantId);
  }

  @Patch('settings')
  @Roles('admin')
  settings(@GetTenantId() tenantId: string, @Body() body: { enabledForStore?: boolean }) {
    return this.service.setEnabledForStore(tenantId, !!body?.enabledForStore);
  }
}

/** Rutas públicas: vuelta de OAuth, notificaciones de Mercado Pago, tienda y seguimiento. */
@Controller('online-payments')
export class OnlinePaymentsPublicController {
  constructor(private readonly service: OnlinePaymentsService) {}

  @Get('mercadopago/callback')
  async callback(@Query() query: { code?: string; state?: string; error?: string }, @Res() res: Response) {
    res.redirect(302, await this.service.handleOAuthCallback(query));
  }

  @Post('mercadopago/webhook')
  @HttpCode(200)
  webhook(
    @Query() query: Record<string, any>,
    @Body() body: any,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.service.handleWebhook({ tenantId: query?.t, signature, requestId, query, body });
  }

  /** ¿La tienda cobra en línea? (checkout) */
  @Get('store/:tenantId')
  store(@Param('tenantId') tenantId: string) {
    return this.service.storeStatus(tenantId);
  }

  /** Seguimiento: si el pedido se puede pagar en línea y cuánto. */
  @Get('orders/:token')
  order(@Param('token') token: string) {
    return this.service.orderStatus(token);
  }

  @Post('orders/:token/checkout')
  checkout(@Param('token') token: string) {
    return this.service.createOrderCheckout(token);
  }

  /** CycloNet: reenviar los avisos de disponibilidad pendientes (clave interna entre servicios). */
  @Post('internal/notify-available')
  notifyAvailable(@Headers('x-internal-key') key?: string) {
    if (!process.env.INTERNAL_API_KEY || key !== process.env.INTERNAL_API_KEY) throw new ForbiddenException();
    return this.service.notifyWaitingTenants();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([TenantPaymentAccount]), OrdersModule],
  controllers: [OnlinePaymentsController, OnlinePaymentsPublicController],
  providers: [OnlinePaymentsService, MercadoPagoClient],
  exports: [OnlinePaymentsService],
})
export class OnlinePaymentsModule {}

import { Controller, Post, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateMarketplaceOrderDto } from './dto/create-marketplace-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
export class OrdersMarketplaceController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Origen de la aceptación de términos/datos (se guarda con el pedido). */
  private requestMeta(req: Request) {
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return {
      ipAddress: forwarded || req.ip || null,
      userAgent: (req.headers['user-agent'] as string | undefined) || null,
    };
  }

  /** Checkout de invitado, sin sesión — sigue siendo la forma "por defecto" de comprar. */
  @Post('marketplace')
  createFromMarketplace(@Body() createDto: CreateMarketplaceOrderDto, @Req() req: Request) {
    return this.ordersService.createFromMarketplace(createDto, this.requestMeta(req));
  }

  /**
   * Checkout de un cliente que sí inició sesión en el Marketplace de su
   * tenant (rol clienteInout). Solo JwtAuthGuard (sin RolesGuard/@Roles):
   * clienteInout no está en el allowlist de roles internos de InOut y no
   * debe estarlo — este endpoint no es del panel administrativo.
   */
  @UseGuards(JwtAuthGuard)
  @Post('marketplace/authenticated')
  createFromMarketplaceAuthenticated(@Body() createDto: CreateMarketplaceOrderDto, @Req() req: Request) {
    const user = req.user as any;
    if (user?.role !== 'clienteInout') {
      throw new ForbiddenException('Solo cuentas de cliente pueden comprar con sesión iniciada.');
    }
    if (!user?.tenantId) {
      throw new ForbiddenException('No se pudo determinar el negocio de esta cuenta.');
    }
    // El tenant del pedido siempre se deriva del token, nunca del body: evita
    // que un cliente de un negocio compre "como sí mismo" en otro negocio.
    return this.ordersService.createFromMarketplaceAuthenticated(
      { ...createDto, tenantId: user.tenantId },
      user.id,
      this.requestMeta(req),
    );
  }
}

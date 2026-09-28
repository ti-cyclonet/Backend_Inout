import { Controller, Post, Get, Body, Param, Req, UseGuards, ForbiddenException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateMarketplaceOrderDto, MarketplaceSlotsQueryDto } from './dto/create-marketplace-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderPaymentsService } from './order-payments.service';
import { OrderPaymentDto } from './dto/order-payment.dto';

@Controller('orders')
export class OrdersMarketplaceController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderPaymentsService: OrderPaymentsService,
  ) {}

  /** Franjas disponibles de un día para lo que hay en el carrito (público). */
  @Post('marketplace/slots')
  slots(@Body() query: MarketplaceSlotsQueryDto) {
    return this.ordersService.getMarketplaceSlots(query);
  }

  /** Seguimiento del pedido con el enlace que recibe el comprador (sirve sin cuenta). */
  @Get('marketplace/track/:token')
  track(@Param('token') token: string) {
    return this.orderPaymentsService.track(token);
  }

  /** El comprador sube el comprobante de un pago (queda por verificar). */
  @Post('marketplace/track/:token/payments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  submitPayment(
    @Param('token') token: string,
    @Body() dto: OrderPaymentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.orderPaymentsService.submitByCustomer(token, dto, file);
  }

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
  /** Datos de su último pedido en esta tienda, para precargar el checkout. */
  @UseGuards(JwtAuthGuard)
  @Get('marketplace/me/last-contact')
  lastMarketplaceContact(@Req() req: Request) {
    const user = req.user as any;
    if (user?.role !== 'clienteInout' || !user?.tenantId) {
      throw new ForbiddenException('Solo cuentas de cliente.');
    }
    return this.ordersService.findLastMarketplaceContact(user.tenantId, user.id);
  }

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

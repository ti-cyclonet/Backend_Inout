import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetTenantId } from '../../common/decorators/get-tenant-id.decorator';
import { GiftCardsService, StoreCustomer } from './gift-cards.service';

/** Panel del negocio: bonos vendidos, su historial y anulación. */
@Controller('gift-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GiftCardsController {
  constructor(private readonly giftCards: GiftCardsService) {}

  @Get()
  @Roles('admin', 'operator', 'viewer')
  list(@GetTenantId() tenantId: string) {
    return this.giftCards.list(tenantId);
  }

  @Get(':id/movements')
  @Roles('admin', 'operator', 'viewer')
  history(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.giftCards.history(tenantId, id);
  }

  @Patch(':id/cancel')
  @Roles('admin')
  cancel(@Param('id') id: string, @Body() body: { reason?: string }, @GetTenantId() tenantId: string, @Req() req: Request) {
    return this.giftCards.cancel(tenantId, id, (req.user as any)?.id, body?.reason || '');
  }
}

/**
 * Tienda: el cliente con sesión (clienteInout) ve sus bonos y reclama uno con
 * el código que le compartieron. Usar un bono exige cuenta registrada en la
 * tienda; el tenant sale siempre del token.
 */
@Controller('gift-cards/marketplace')
@UseGuards(JwtAuthGuard)
export class GiftCardsMarketplaceController {
  constructor(private readonly giftCards: GiftCardsService) {}

  private customer(req: Request): { tenantId: string; customer: StoreCustomer } {
    const user = req.user as any;
    if (user?.role !== 'clienteInout' || !user?.tenantId) {
      throw new ForbiddenException('Inicia sesión con tu cuenta de cliente de la tienda para usar bonos.');
    }
    return { tenantId: user.tenantId, customer: { id: user.id, email: user.email || null } };
  }

  @Get('mine')
  mine(@Req() req: Request) {
    const { tenantId, customer } = this.customer(req);
    return this.giftCards.listMine(tenantId, customer);
  }

  @Post('claim')
  claim(@Body() body: { code?: string }, @Req() req: Request) {
    const { tenantId, customer } = this.customer(req);
    return this.giftCards.claim(tenantId, customer, body?.code || '');
  }
}

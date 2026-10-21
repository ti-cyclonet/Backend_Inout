import { Body, Controller, ForbiddenException, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetTenantId } from '../../common/decorators/get-tenant-id.decorator';
import { canEditHomeTheme } from '../home/home-theme';
import { FeaturedService } from './featured.service';

/** Destacados en CycloNet Market (ver featured.ts). */
@Controller('market-featured')
export class FeaturedController {
  constructor(private readonly featured: FeaturedService) {}

  /** Público: tiendas destacadas ahora (la vitrina las muestra primero). */
  @Get('active')
  async active() {
    return { tenantIds: await this.featured.activeTenantIds() };
  }

  /** Oferta para el negocio: precios, próxima fecha libre y sus compras. */
  @Get('offer')
  @UseGuards(JwtAuthGuard)
  offer(@GetTenantId() tenantId: string) {
    return this.featured.offer(tenantId);
  }

  /** Solicitar un destacado (emite la factura; se activa al pagarla en FactoNet). */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  request(@GetTenantId() tenantId: string, @Body() body: { plan: 'WEEK' | 'MONTH' }) {
    return this.featured.request(tenantId, body?.plan);
  }

  /** Precios y cupos: solo la cuenta de CycloNet (CYCLONET_TENANT_IDS). */
  @Get('settings')
  @UseGuards(JwtAuthGuard)
  async settings(@Request() req) {
    if (!canEditHomeTheme(req.user?.tenantId)) throw new ForbiddenException('Solo la cuenta de CycloNet');
    return this.featured.getSettings();
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(@Request() req, @Body() body: any) {
    if (!canEditHomeTheme(req.user?.tenantId)) throw new ForbiddenException('Solo la cuenta de CycloNet');
    return this.featured.setSettings(body);
  }
}

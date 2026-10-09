import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, NotFoundException, ForbiddenException, HttpCode } from '@nestjs/common';
import { MarketplaceStatsService } from './marketplace-stats.service';
import { MarketplaceConfigService } from './marketplace-config.service';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { resolvePaymentOptions } from '../orders/payment-plans';
import { resolveScheduling } from '../orders/scheduling';
import { resolveThanksMessages } from '../orders/thanks-messages';

@Controller('marketplace-config')
export class MarketplaceConfigController {
  constructor(
    private readonly marketplaceConfigService: MarketplaceConfigService,
    private readonly statsService: MarketplaceStatsService,
  ) {}

  /** Público: vistas y unidades vendidas reales de cada ítem de la tienda. */
  @Get(':tenantId/stats')
  stats(@Param('tenantId') tenantId: string) {
    return this.statsService.estadisticas(tenantId);
  }

  /** Público: un visitante abrió el detalle de un ítem. */
  @Post(':tenantId/items/:itemId/view')
  @HttpCode(204)
  async registrarVista(@Param('tenantId') tenantId: string, @Param('itemId') itemId: string) {
    await this.statsService.registrarVista(tenantId, itemId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async updateConfig(@Body() dto: UpdateMarketplaceConfigDto, @Request() req) {
    if (req.user.tenantId !== dto.tenantId) {
      throw new Error('No tienes permisos para modificar este marketplace');
    }
    return await this.marketplaceConfigService.updateConfig(dto);
  }

  /**
   * GET /marketplace-config/resolve/:slug
   * Resuelve un slug amigable al tenantId real.
   * Ej: /marketplace-config/resolve/jimmyjon → { tenantId: 'abc-123', slug: 'jimmyjon' }
   */
  @Get('resolve/:slug')
  async resolveSlug(@Param('slug') slug: string) {
    const config = await this.marketplaceConfigService.getConfigBySlug(slug);
    if (!config) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return { tenantId: config.tenantId, slug: config.slug };
  }

  @Patch(':tenantId/slug')
  @UseGuards(JwtAuthGuard)
  async updateSlug(
    @Param('tenantId') tenantId: string,
    @Body() body: { slug: string },
    @Request() req,
  ) {
    if (req.user.tenantId !== tenantId) {
      throw new Error('No tienes permisos para modificar este marketplace');
    }
    return await this.marketplaceConfigService.updateSlug(tenantId, body.slug);
  }

  /** Formas de pago que ofrece la tienda (público: las usa el checkout). */
  @Get(':tenantId/payment-options')
  async getPaymentOptions(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return resolvePaymentOptions(config?.paymentOptions);
  }

  @Patch(':tenantId/payment-options')
  @UseGuards(JwtAuthGuard)
  async updatePaymentOptions(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.updatePaymentOptions(tenantId, resolvePaymentOptions(body));
  }

  /** Programación de pedidos de la tienda (público: la usa el checkout). */
  @Get(':tenantId/scheduling')
  async getScheduling(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return resolveScheduling(config?.scheduling);
  }

  @Patch(':tenantId/scheduling')
  @UseGuards(JwtAuthGuard)
  async updateScheduling(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.updateScheduling(tenantId, resolveScheduling(body));
  }

  /** Textos de la modal de agradecimiento al entregar el pedido. */
  @Get(':tenantId/thanks-messages')
  async getThanksMessages(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return resolveThanksMessages(config?.thanksMessages);
  }

  @Patch(':tenantId/thanks-messages')
  @UseGuards(JwtAuthGuard)
  async updateThanksMessages(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.updateThanksMessages(tenantId, resolveThanksMessages(body));
  }

  @Get(':tenantId')
  async getConfig(@Param('tenantId') tenantId: string) {
    return await this.marketplaceConfigService.getConfig(tenantId);
  }

  @Get()
  async getAllConfigs() {
    return await this.marketplaceConfigService.getAllConfigs();
  }
}
import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, NotFoundException, ForbiddenException } from '@nestjs/common';
import { MarketplaceConfigService } from './marketplace-config.service';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { resolvePaymentOptions } from '../orders/payment-plans';

@Controller('marketplace-config')
export class MarketplaceConfigController {
  constructor(
    private readonly marketplaceConfigService: MarketplaceConfigService,
  ) {}

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

  @Get(':tenantId')
  async getConfig(@Param('tenantId') tenantId: string) {
    return await this.marketplaceConfigService.getConfig(tenantId);
  }

  @Get()
  async getAllConfigs() {
    return await this.marketplaceConfigService.getAllConfigs();
  }
}
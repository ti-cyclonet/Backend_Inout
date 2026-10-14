import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, NotFoundException, ForbiddenException, BadRequestException, HttpCode, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MarketplaceStatsService } from './marketplace-stats.service';
import { MarketplaceConfigService } from './marketplace-config.service';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { resolvePaymentOptions } from '../orders/payment-plans';
import { resolveScheduling } from '../orders/scheduling';
import { resolveDeliveryOptions, validateDeliveryOptions } from '../orders/delivery-options';
import { resolveThanksMessages } from '../orders/thanks-messages';
import { BusinessParamsService } from '../config/business-params.service';
import { storeInfoFrom, validateStoreInfo } from './store-info';
import { MENU_EXTRA_IMAGE_MAX_BYTES, resolveMenuExtras } from './menu-extras';
import { resolveGiftCardOptions, validateGiftCardOptions } from '../orders/gift-cards/gift-cards';
import { HOME_THEMES, canEditHomeTheme, isHomeTheme } from './home/home-theme';

@Controller('marketplace-config')
export class MarketplaceConfigController {
  constructor(
    private readonly marketplaceConfigService: MarketplaceConfigService,
    private readonly statsService: MarketplaceStatsService,
    private readonly businessParamsService: BusinessParamsService,
  ) {}

  /** Público: tema de la vitrina CycloNet Market. */
  @Get('home/theme')
  async getHomeTheme() {
    return { displayMode: await this.marketplaceConfigService.getHomeTheme() };
  }

  /** ¿El usuario puede cambiar el tema de la vitrina? (cuenta de CycloNet). */
  @Get('home/theme/permissions')
  @UseGuards(JwtAuthGuard)
  getHomeThemePermissions(@Request() req) {
    return { canEdit: canEditHomeTheme(req.user?.tenantId), themes: HOME_THEMES };
  }

  @Patch('home/theme')
  @UseGuards(JwtAuthGuard)
  async updateHomeTheme(@Body() body: any, @Request() req) {
    if (!canEditHomeTheme(req.user?.tenantId)) {
      throw new ForbiddenException('Solo la cuenta de CycloNet puede cambiar el tema de CycloNet Market');
    }
    if (!isHomeTheme(body?.displayMode)) {
      throw new BadRequestException(`Tema no válido. Usa: ${HOME_THEMES.join(', ')}`);
    }
    return { displayMode: await this.marketplaceConfigService.setHomeTheme(body.displayMode) };
  }

  /**
   * Público: nombre de la tienda para el título del navegador. Es el parámetro
   * NEGOCIO_NOMBRE del período activo (Authoriza); null si no está configurado.
   */
  @Get(':tenantId/store-name')
  async storeName(@Param('tenantId') tenantId: string) {
    const params = await this.businessParamsService.getParams(tenantId);
    const name = String(params['NEGOCIO_NOMBRE'] ?? '').trim();
    return { name: name || null };
  }

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
  /** Bonos de regalo de la tienda (público: la tienda muestra si los vende y sus valores). */
  @Get(':tenantId/gift-cards')
  async getGiftCards(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return resolveGiftCardOptions(config?.giftCards);
  }

  @Patch(':tenantId/gift-cards')
  @UseGuards(JwtAuthGuard)
  async updateGiftCards(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.updateGiftCards(tenantId, validateGiftCardOptions(body));
  }

  /** Formas de entrega: domicilio (con su valor) y/o recoger (público: las usa el checkout). */
  @Get(':tenantId/delivery-options')
  async getDeliveryOptions(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return resolveDeliveryOptions(config?.deliveryOptions);
  }

  @Patch(':tenantId/delivery-options')
  @UseGuards(JwtAuthGuard)
  async updateDeliveryOptions(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.updateDeliveryOptions(tenantId, validateDeliveryOptions(body));
  }

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

  /** WhatsApp y mensaje de bienvenida de la tienda (público: los muestra la tienda). */
  @Get(':tenantId/store-info')
  async getStoreInfo(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return storeInfoFrom(config);
  }

  @Patch(':tenantId/store-info')
  @UseGuards(JwtAuthGuard)
  async updateStoreInfo(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    const result = validateStoreInfo(body);
    if ('error' in result) throw new BadRequestException(result.error);
    return this.marketplaceConfigService.updateStoreInfo(tenantId, result.value);
  }

  /** Información de la carta (público: la muestran la carta y la tienda). */
  @Get(':tenantId/menu-extras')
  async getMenuExtras(@Param('tenantId') tenantId: string) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return resolveMenuExtras(config?.menuExtras);
  }

  @Patch(':tenantId/menu-extras')
  @UseGuards(JwtAuthGuard)
  async updateMenuExtras(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.updateMenuExtras(tenantId, resolveMenuExtras(body));
  }

  /** Foto de un renglón de la carta (campo 'image'). Devuelve { imageUrl, imagePublicId }. */
  @Post(':tenantId/menu-extras/image')
  @UseGuards(JwtAuthGuard)
  // Margen sobre el máximo para que el servicio devuelva el mensaje claro
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MENU_EXTRA_IMAGE_MAX_BYTES + 1024 * 1024 } }))
  async uploadMenuExtraImage(@Param('tenantId') tenantId: string, @UploadedFile() file: Express.Multer.File, @Request() req) {
    if (req.user.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para modificar este marketplace');
    }
    return this.marketplaceConfigService.uploadMenuExtraImage(tenantId, file);
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
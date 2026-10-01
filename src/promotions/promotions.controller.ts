import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { PromotionsService } from './promotions.service';
import { PricingService } from './pricing.service';
import { CreatePromotionDto, MarketplaceQuoteDto, QuoteDto, UpdatePromotionDto } from './dto/promotion.dto';

/**
 * Promociones. Crear/editar/eliminar: solo admin. Consultar y cotizar: todos
 * los roles de InOut. El MarketPlace usa las rutas públicas (promos en curso
 * y cotización del carrito, que calcula el precio en el servidor).
 */
@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly pricingService: PricingService,
  ) {}

  /** Público: promociones en curso ahora en el MarketPlace (etiquetas en el catálogo). */
  @Get('tenant/:tenantId/live')
  live(@Param('tenantId') tenantId: string) {
    return this.promotionsService.findLiveForMarketplace(tenantId);
  }

  /** Público: precio del carrito del MarketPlace (el mismo cálculo que al crear el pedido). */
  @Post('marketplace/quote')
  marketplaceQuote(@Body() dto: MarketplaceQuoteDto) {
    return this.pricingService.priceLines(dto.tenantId, dto.items, 'MARKETPLACE', 'ENFORCE');
  }

  /** Panel: precio sugerido (normal y con la mejor promoción vigente) para las líneas. */
  @Post('quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  quote(@GetTenantId() tenantId: string, @Body() dto: QuoteDto) {
    return this.pricingService.priceLines(tenantId, dto.items, 'POS', 'ENFORCE');
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  findAll(@GetTenantId() tenantId: string) {
    return this.promotionsService.findAll(tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  findOne(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.findOne(tenantId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@GetTenantId() tenantId: string, @Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(tenantId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.remove(tenantId, id);
  }
}

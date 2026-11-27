import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ProductReviewsService } from './product-reviews.service';
import { ReviewInput } from './product-reviews-rules';

/** Opiniones en la tienda en línea (sin sesión). */
@Controller('product-reviews/public')
export class ProductReviewsPublicController {
  constructor(private readonly reviews: ProductReviewsService) {}

  /** ¿La tienda muestra opiniones? */
  @Get(':tenantId/settings')
  async settings(@Param('tenantId') tenantId: string) {
    const s = await this.reviews.settings(tenantId);
    return { enabled: s.enabled };
  }

  /** Promedio y número de opiniones publicadas de cada ítem (estrellas del catálogo). */
  @Get(':tenantId/summary')
  summary(@Param('tenantId') tenantId: string) {
    return this.reviews.publicSummary(tenantId);
  }

  @Get(':tenantId/items/:itemId')
  list(@Param('tenantId') tenantId: string, @Param('itemId') itemId: string) {
    return this.reviews.publicList(tenantId, itemId);
  }

  @Post(':tenantId/items/:itemId')
  create(@Param('tenantId') tenantId: string, @Param('itemId') itemId: string, @Body() body: ReviewInput, @Req() req: any) {
    return this.reviews.create(tenantId, itemId, body || {}, {
      ipAddress: String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim(),
      userAgent: String(req?.headers?.['user-agent'] || ''),
    });
  }
}

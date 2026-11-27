import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { ProductReviewsService } from './product-reviews.service';

/**
 * Opiniones de los clientes (panel). Las ve todo el equipo; publicarlas,
 * ocultarlas y responderlas lo hace el admin o el operador; activarlas en la
 * tienda y borrarlas, el admin.
 */
@Controller('product-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductReviewsController {
  constructor(private readonly reviews: ProductReviewsService) {}

  @Get('settings')
  @Roles('admin', 'operator', 'viewer')
  settings(@GetTenantId() tenantId: string) {
    return this.reviews.settings(tenantId);
  }

  @Patch('settings')
  @Roles('admin')
  updateSettings(@GetTenantId() tenantId: string, @Body() body: any) {
    return this.reviews.updateSettings(tenantId, body);
  }

  @Get()
  @Roles('admin', 'operator', 'viewer')
  list(@GetTenantId() tenantId: string, @Query('status') status?: string) {
    return this.reviews.adminList(tenantId, status || undefined);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  update(@GetTenantId() tenantId: string, @Param('id') id: string, @Body() body: any) {
    return this.reviews.update(tenantId, id, body);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@GetTenantId() tenantId: string, @Param('id') id: string) {
    return this.reviews.remove(tenantId, id);
  }
}

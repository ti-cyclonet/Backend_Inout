import { Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { TenantBrandingService } from './tenant-branding.service';
import { LOGO_MAX_BYTES } from './logo-url';

/**
 * Logo del negocio. Lo cambia solo el admin del tenant; lo leen todos los
 * usuarios del tenant, y la lectura por tenantId es pública porque el
 * MarketPlace (sin sesión) también lo muestra.
 */
@Controller('tenant-branding')
export class TenantBrandingController {
  constructor(private readonly brandingService: TenantBrandingService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  getMine(@GetTenantId() tenantId: string) {
    return this.brandingService.get(tenantId);
  }

  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  // Margen sobre LOGO_MAX_BYTES para que el servicio devuelva el mensaje claro
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: LOGO_MAX_BYTES + 1024 * 1024 } }))
  uploadLogo(@GetTenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.brandingService.uploadLogo(tenantId, file);
  }

  @Delete('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  removeLogo(@GetTenantId() tenantId: string) {
    return this.brandingService.removeLogo(tenantId);
  }

  /** Público (MarketPlace). */
  @Get(':tenantId')
  getPublic(@Param('tenantId') tenantId: string) {
    return this.brandingService.get(tenantId);
  }
}

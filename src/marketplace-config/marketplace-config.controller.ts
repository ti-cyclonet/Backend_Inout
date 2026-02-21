import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { MarketplaceConfigService } from './marketplace-config.service';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('marketplace-config')
export class MarketplaceConfigController {
  constructor(
    private readonly marketplaceConfigService: MarketplaceConfigService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async updateConfig(@Body() dto: UpdateMarketplaceConfigDto, @Request() req) {
    // Verificar que el usuario pertenece al tenant
    if (req.user.tenantId !== dto.tenantId) {
      throw new Error('No tienes permisos para modificar este marketplace');
    }
    return await this.marketplaceConfigService.updateConfig(dto);
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
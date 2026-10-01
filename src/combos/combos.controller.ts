import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { COMBO_IMAGE_MAX_BYTES, CombosService } from './combos.service';
import { AssembleKitDto, CreateComboDto, UpdateComboDto } from './dto/combo.dto';

const actorOf = (req: Request) => (req.user as any)?.email || (req.user as any)?.id || null;

/**
 * Combos y kits. Crear, editar, armar y desarmar: solo admin (afectan
 * precios, márgenes e inventario). Consultar: todos los roles de InOut
 * (el operador vende combos). El catálogo público lo usa el MarketPlace.
 */
@Controller('combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  /** Público (MarketPlace): combos activos y visibles de la tienda. */
  @Get('tenant/:tenantId/catalog')
  catalog(@Param('tenantId') tenantId: string) {
    return this.combosService.findCatalog(tenantId);
  }

  /** Opciones para los selectores de combos y promociones (catálogo completo, sin paginar). */
  @Get('options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  options(@GetTenantId() tenantId: string) {
    return this.combosService.catalogOptions(tenantId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  findAll(@GetTenantId() tenantId: string) {
    return this.combosService.findAll(tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  findOne(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.combosService.findOne(tenantId, id);
  }

  @Get(':id/assemblies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'viewer')
  assemblies(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.combosService.findAssemblies(tenantId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@GetTenantId() tenantId: string, @Body() dto: CreateComboDto) {
    return this.combosService.create(tenantId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComboDto) {
    return this.combosService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.combosService.remove(tenantId, id);
  }

  /** Imagen del combo (campo 'image'). */
  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  // Margen sobre el máximo para que el servicio devuelva el mensaje claro
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: COMBO_IMAGE_MAX_BYTES + 1024 * 1024 } }))
  setImage(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.combosService.setImage(tenantId, id, file);
  }

  @Delete(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  removeImage(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.combosService.removeImage(tenantId, id);
  }

  @Post(':id/assemble')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  assemble(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssembleKitDto, @Req() req: Request) {
    return this.combosService.assemble(tenantId, id, dto, actorOf(req));
  }

  @Post(':id/disassemble')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  disassemble(@GetTenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssembleKitDto, @Req() req: Request) {
    return this.combosService.disassemble(tenantId, id, dto, actorOf(req));
  }
}

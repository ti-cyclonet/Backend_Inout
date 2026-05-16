import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MaterialsService } from './material.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTenantId } from 'src/common/decorators/get-tenant-id.decorator';
import { CheckLimit } from 'src/usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from 'src/usage-counters/guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from 'src/usage-counters/interceptors/usage-warning.interceptor';
import * as XLSX from 'xlsx';

@Controller('materials') 
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Delete('delete-all')
  deleteAll() {
    return this.materialsService.deleteAllMaterials();
  }

  @UseGuards(JwtAuthGuard, LimitEnforcementGuard)
  @Post()
  @CheckLimit('nMateriales')
  @UseInterceptors(UsageWarningInterceptor)
  create(@Body() createMaterialDto: CreateMaterialDto, @GetTenantId() tenantId: string) {
    return this.materialsService.create(createMaterialDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('transformed')
  createTransformed(@Body() createMaterialDto: any, @GetTenantId() tenantId: string) {
    return this.materialsService.createTransformed(createMaterialDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('metrics')
  getMetrics(@GetTenantId() tenantId: string) {
    return this.materialsService.getMetrics(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('activities')
  getActivities(@GetTenantId() tenantId: string) {
    return this.materialsService.getActivities(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @GetTenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('stockStatus') stockStatus?: string,
    @Query('category') category?: string,
    @Query('ubicacion') ubicacion?: string
  ) {
    const filters = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      search,
      status,
      stockStatus,
      category,
      ubicacion
    };
    return this.materialsService.findAll(filters, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @GetTenantId() tenantId: string) {
    return this.materialsService.findOne(id, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateMaterialDto: UpdateMaterialDto, @GetTenantId() tenantId: string) {
    return this.materialsService.update(id, updateMaterialDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @GetTenantId() tenantId: string) {
    return this.materialsService.remove(id, tenantId);
  }

  @Get('template/download')
  downloadTemplate(@Res() res: Response) {
    const templatePath = './templates/plantilla_materiales.xlsx';
    
    try {
      res.download(templatePath, 'plantilla_materiales.xlsx');
    } catch (error) {
      // Si no existe el archivo, generar uno dinámicamente
      const workbook = XLSX.utils.book_new();
      
      const data = [
        ['Nombre*', 'Descripción', 'Precio', 'Unidad Medida*', 'Unidad Descarga*', 'Stock Máximo*', 'Stock Mínimo*', 'Ubicación', 'ID Categoría'],
        ['Material Ejemplo', 'Descripción del material', '0', 'Kilogramos', 'Kilogramos', '100', '10', 'Bodega A', '1']
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Materiales');
      
      const configData = [
        ['Unidades de Medida Disponibles'],
        ['Miligramos'], ['Gramos'], ['Kilogramos'], ['Libras'], ['Onzas'],
        ['Mililitros'], ['Litros'], ['Galones'], ['Centimetros'], ['Metros'],
        ['Pulgadas'], ['Pies'], ['Metros cuadrados'], ['Metros cúbicos'],
        ['Unidades'], ['Piezas'], ['Cajas'], ['Paquetes'], ['Docentas']
      ];
      const configSheet = XLSX.utils.aoa_to_sheet(configData);
      XLSX.utils.book_append_sheet(workbook, configSheet, 'Configuración');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename=plantilla_materiales.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk-validate')
  @UseInterceptors(FileInterceptor('file'))
  async bulkValidate(@UploadedFile() file: Express.Multer.File, @GetTenantId() tenantId: string) {
    return this.materialsService.bulkValidate(file, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file'))
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @GetTenantId() tenantId: string) {
    return this.materialsService.bulkUpload(file, tenantId);
  }
}
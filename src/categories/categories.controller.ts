import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import * as XLSX from 'xlsx';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('template/download')
  downloadTemplate(@Res() res: Response) {
    const workbook = XLSX.utils.book_new();
    
    const data = [
      ['Nombre*', 'Descripción', '', '', '', '', '', '', '', '', 'Tipo_plantilla'],
      ['Proteínas y Embutidos', 'Carnes rojas, aves, pescados, mariscos y huevos', '', '', '', '', '', '', '', '', 'CATEGORIAS'],
      ['Vegetales y Frutas', 'Productos frescos de huerta']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    // Columna K (Tipo_plantilla) es solo un control interno para validar el
    // tipo de plantilla al subir el archivo; se oculta para que el cliente
    // no la vea ni la diligencie por error. Solo lleva valor en la primera
    // fila de datos, no hace falta repetirla en cada fila.
    worksheet['!cols'] = worksheet['!cols'] || [];
    worksheet['!cols'][10] = { hidden: true };
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Categorías');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_categorias.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto, @GetTenantId() tenantId: string) {
    return this.categoriesService.create(createCategoryDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.categoriesService.findAll(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.categoriesService.findOne(+id, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCategoryDto: Partial<CreateCategoryDto>, @GetTenantId() tenantId: string) {
    return this.categoriesService.update(+id, updateCategoryDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.categoriesService.remove(+id, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file'))
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @GetTenantId() tenantId: string) {
    return this.categoriesService.bulkUpload(file, tenantId);
  }
}

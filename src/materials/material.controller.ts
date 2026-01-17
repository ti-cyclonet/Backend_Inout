import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { MaterialsService } from './material.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTenantId } from 'src/common/decorators/get-tenant-id.decorator';

@Controller('materials') 
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Delete('delete-all')
  deleteAll() {
    return this.materialsService.deleteAllMaterials();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
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
  findAll(@Query() paginationDto: PaginationDto, @GetTenantId() tenantId: string) {
    return this.materialsService.findAll(paginationDto, tenantId);
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
}

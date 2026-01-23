import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto, @GetTenantId() tenantId: string) {
    return this.categoriesService.create(createCategoryDto, tenantId);
  }

  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.categoriesService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.categoriesService.findOne(+id, tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCategoryDto: Partial<CreateCategoryDto>, @GetTenantId() tenantId: string) {
    return this.categoriesService.update(+id, updateCategoryDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.categoriesService.remove(+id, tenantId);
  }
}

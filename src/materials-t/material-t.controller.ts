import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { MaterialsTService } from './material-t.service';
import { CreateMaterialTDto } from './dto/create-material-t.dto';
import { UpdateMaterialTDto } from './dto/update-material-t.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

// @UseGuards(JwtAuthGuard)
@Controller('materials-t') // Endpoint principal
export class MaterialsTController {
  constructor(private readonly materialsService: MaterialsTService) {}

  @Post()
  create(@Body() createMaterialDto: CreateMaterialTDto) {
    return this.materialsService.create(createMaterialDto);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.materialsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.materialsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateMaterialDto: UpdateMaterialTDto) {
    return this.materialsService.update(id, updateMaterialDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.materialsService.remove(id);
  }
}

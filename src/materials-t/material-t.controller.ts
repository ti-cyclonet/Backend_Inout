import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MaterialsTService } from './material-t.service';
import { CreateMaterialTDto } from './dto/create-material-t.dto';
import { UpdateMaterialTDto } from './dto/update-material-t.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTenantId } from 'src/common/decorators/get-tenant-id.decorator';

@UseGuards(JwtAuthGuard)
@Controller('materials-t') // Endpoint principal
export class MaterialsTController {
  constructor(private readonly materialsService: MaterialsTService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images'))
  create(
    @Body() createMaterialDto: any, 
    @UploadedFiles() files: Express.Multer.File[],
    @GetTenantId() tenantId: string
  ) {
    console.log('Received data:', createMaterialDto);
    console.log('Received files:', files);
    
    // Attach files to the DTO if they exist
    if (files && files.length > 0) {
      createMaterialDto.uploadedFiles = files;
    }
    
    return this.materialsService.create(createMaterialDto, tenantId);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto, @GetTenantId() tenantId: string) {
    return this.materialsService.findAll(paginationDto, tenantId);
  }

  @Get(':id/compositions')
  getCompositions(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.materialsService.getCompositions(id);
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

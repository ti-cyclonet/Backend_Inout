import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTenantId } from 'src/common/decorators/get-tenant-id.decorator';
import { CheckLimit } from 'src/usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from 'src/usage-counters/guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from 'src/usage-counters/interceptors/usage-warning.interceptor';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('all')
  findAllProducts(@Query('page') page: string, @Query('limit') limit: string) {
    return this.productsService.findAllProducts(+page || 1, +limit || 50);
  }

  @Get('tenant/:tenantId')
  findByTenant(@Param('tenantId') tenantId: string, @Query('page') page: string, @Query('limit') limit: string) {
    return this.productsService.findAll(tenantId, +page || 1, +limit || 10);
  }

  @UseGuards(JwtAuthGuard, LimitEnforcementGuard)
  @Post()
  @CheckLimit('nProductos')
  @UseInterceptors(UsageWarningInterceptor)
  create(@Body() createDto: CreateProductDto, @GetTenantId() tenantId: string) {
    return this.productsService.create(createDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('page') page: string, @Query('limit') limit: string, @GetTenantId() tenantId: string) {
    return this.productsService.findAll(tenantId, +page || 1, +limit || 10);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.productsService.findOne(id, tenantId);
  }

  @Get(':id/composition')
  getComposition(@Param('id') id: string) {
    return this.productsService.getComposition(id);
  }

  @Get(':id/composition-two')
  getCompositionTwo(@Param('id') id: string) {
    return this.productsService.getCompositionTwoByProduct(id);
  }

  @Get(':id/composition-three')
  getCompositionThree(@Param('id') id: string) {
    return this.productsService.getCompositionThreeByProduct(id);
  }

  @Get(':id/ingredients')
  getIngredients(@Param('id') id: string) {
    return this.productsService.getIngredients(id);
  }

  @UseGuards(JwtAuthGuard, LimitEnforcementGuard)
  @Post('production')
  @CheckLimit('nLotes')
  @UseInterceptors(UsageWarningInterceptor)
  createProduction(@Body() productionData: any, @GetTenantId() tenantId: string) {
    return this.productsService.createProduction(productionData, tenantId);
  }

  @Get(':id/movements')
  getProductMovements(@Param('id') id: string) {
    return this.productsService.getProductMovements(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any, @GetTenantId() tenantId: string) {
    return this.productsService.update(id, updateDto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.productsService.remove(id, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-images')
  @UseInterceptors(FilesInterceptor('images', 10))
  uploadImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[], @GetTenantId() tenantId: string) {
    return this.productsService.uploadImages(id, files, tenantId);
  }
}

@Controller('stock')
export class StockController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('product/:id')
  updateStock(@Param('id') id: string, @Body() updateData: { quantity: number }, @GetTenantId() tenantId: string) {
    return this.productsService.updateStock(id, updateData.quantity, tenantId);
  }
}

@Controller('compositionTwo')
export class CompositionTwoController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getCompositionTwo(@GetTenantId() tenantId: string) {
    return this.productsService.getCompositionTwo(tenantId);
  }
}

@Controller('compositionThree')
export class CompositionThreeController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getCompositionThree(@GetTenantId() tenantId: string) {
    return this.productsService.getCompositionThree(tenantId);
  }
}

@Controller('kardex')
export class KardexController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('movements')
  createMovements(@Body() movementsData: any[], @GetTenantId() tenantId: string) {
    return { message: 'Movimientos de kardex registrados exitosamente' };
  }
}

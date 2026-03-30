import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController, StockController, CompositionTwoController, CompositionThreeController, KardexController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductComposition } from './entities/product-composition.entity';
import { CompositionTwo } from './entities/composition-two.entity';
import { CompositionThree } from './entities/composition-three.entity';
import { ProductProduction } from './entities/product-production.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialImage } from '../materials/entities/material-image.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductComposition, CompositionTwo, CompositionThree, ProductProduction, Material, MaterialImage]), CloudinaryModule],
  controllers: [ProductsController, StockController, CompositionTwoController, CompositionThreeController, KardexController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

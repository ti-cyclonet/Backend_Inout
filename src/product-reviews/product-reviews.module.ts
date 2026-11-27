import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductReview } from './entities/product-review.entity';
import { MarketplaceConfigModule } from '../marketplace-config/marketplace-config.module';
import { ProductReviewsService } from './product-reviews.service';
import { ProductReviewsController } from './product-reviews.controller';
import { ProductReviewsPublicController } from './product-reviews-public.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductReview]), MarketplaceConfigModule],
  controllers: [ProductReviewsController, ProductReviewsPublicController],
  providers: [ProductReviewsService],
})
export class ProductReviewsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantBranding } from './entities/tenant-branding.entity';
import { TenantBrandingService } from './tenant-branding.service';
import { TenantBrandingController } from './tenant-branding.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [TypeOrmModule.forFeature([TenantBranding]), CloudinaryModule],
  controllers: [TenantBrandingController],
  providers: [TenantBrandingService],
  exports: [TenantBrandingService],
})
export class TenantBrandingModule {}

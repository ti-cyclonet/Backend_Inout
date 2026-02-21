import { Module } from '@nestjs/common';
import { MaterialsService } from './material.service';
import { MaterialsController } from './material.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { Material } from './entities/material.entity';
import { MaterialImage } from './entities/material-image.entity';
import { Activity } from './entities/activity.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService],
  imports: [
    TypeOrmModule.forFeature([Material, MaterialImage, Activity]),
    CloudinaryModule,
    MulterModule.register({ 
      storage: memoryStorage()
    })
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}

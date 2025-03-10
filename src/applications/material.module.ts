import { Module } from '@nestjs/common';
import { MaterialsService } from './material.service';
import { MaterialsController } from './material.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Material } from './entities/material.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService],
  imports: [
    TypeOrmModule.forFeature([Material]),
    CloudinaryModule
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}

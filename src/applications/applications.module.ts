import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Application } from './entities';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  imports: [
    TypeOrmModule.forFeature([Application]),
    CloudinaryModule
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

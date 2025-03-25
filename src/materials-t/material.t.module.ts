import { Module } from '@nestjs/common';
import { MaterialsTService } from './material-t.service';
import { MaterialsTController } from './material-t.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MaterialT } from './entities/material-t.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  controllers: [MaterialsTController],
  providers: [MaterialsTService],
  imports: [
    TypeOrmModule.forFeature([MaterialT]),
    CloudinaryModule
  ],
  exports: [MaterialsTService],
})
export class MaterialsTModule {}


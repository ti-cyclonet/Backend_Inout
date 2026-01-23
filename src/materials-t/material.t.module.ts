import { Module } from '@nestjs/common';
import { MaterialsTService } from './material-t.service';
import { MaterialsTController } from './material-t.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MaterialT, CompositionOne } from './entities';
import { Activity } from '../materials/entities/activity.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialImage } from '../materials/entities/material-image.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  controllers: [MaterialsTController],
  providers: [MaterialsTService],
  imports: [
    TypeOrmModule.forFeature([MaterialT, CompositionOne, Activity, Material, MaterialImage, InventoryMovement]),
    CloudinaryModule
  ],
  exports: [MaterialsTService],
})
export class MaterialsTModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemBarcode } from './entities/item-barcode.entity';
import { BarcodesService } from './barcodes.service';
import { BarcodesController } from './barcodes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ItemBarcode])],
  controllers: [BarcodesController],
  providers: [BarcodesService],
  exports: [BarcodesService],
})
export class BarcodesModule {}

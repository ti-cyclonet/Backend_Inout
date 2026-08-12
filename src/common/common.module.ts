import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { UnitConversionService } from './services/unit-conversion.service';

@Module({
  providers: [CommonService, UnitConversionService],
  exports: [CommonService, UnitConversionService]
})
export class CommonModule {}

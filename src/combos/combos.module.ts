import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Combo } from './entities/combo.entity';
import { ComboComponent } from './entities/combo-component.entity';
import { ComboAssembly } from './entities/combo-assembly.entity';
import { CombosService } from './combos.service';
import { CombosController } from './combos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Combo, ComboComponent, ComboAssembly])],
  controllers: [CombosController],
  providers: [CombosService],
  exports: [CombosService],
})
export class CombosModule {}

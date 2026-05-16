import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { Supplier } from './entities/supplier.entity';
import { CommonModule } from '../common/common.module';
import { UsageCountersModule } from '../usage-counters/usage-counters.module';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), CommonModule, UsageCountersModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}

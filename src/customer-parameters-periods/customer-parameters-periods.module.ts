import { Module } from '@nestjs/common';
import { CustomerParametersPeriodsController } from './customer-parameters-periods.controller';
import { CustomerParametersPeriodsService } from './customer-parameters-periods.service';

@Module({
  controllers: [CustomerParametersPeriodsController],
  providers: [CustomerParametersPeriodsService],
  exports: [CustomerParametersPeriodsService]
})
export class CustomerParametersPeriodsModule {}

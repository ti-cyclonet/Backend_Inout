import { Module, Global } from '@nestjs/common';
import { BusinessParamsService } from './business-params.service';
import { BusinessParamsController } from './business-params.controller';

@Global()
@Module({
  providers: [BusinessParamsService],
  controllers: [BusinessParamsController],
  exports: [BusinessParamsService],
})
export class BusinessParamsModule {}

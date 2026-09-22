import { IsString, IsNumber, Min } from 'class-validator';

export class UpsertProductionPlanDto {
  @IsString()
  productId: string;

  @IsString()
  periodId: string;

  @IsNumber()
  @Min(0)
  plannedMonthlyUnits: number;
}

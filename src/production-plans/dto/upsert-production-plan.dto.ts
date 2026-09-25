import { IsString, IsNumber, Min, IsOptional, IsIn } from 'class-validator';

export class UpsertProductionPlanDto {
  /** Id del ítem (producto, material o material compuesto según itemType). */
  @IsString()
  productId: string;

  /** 'product' (default) o material de reventa ('material' | 'material_t'). */
  @IsOptional()
  @IsIn(['product', 'material', 'material_t'])
  itemType?: 'product' | 'material' | 'material_t';

  @IsString()
  periodId: string;

  @IsNumber()
  @Min(0)
  plannedMonthlyUnits: number;
}

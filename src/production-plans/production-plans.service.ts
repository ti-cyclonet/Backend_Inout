import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductionPlan } from './entities/production-plan.entity';
import { Product } from '../products/entities/product.entity';
import { UpsertProductionPlanDto } from './dto/upsert-production-plan.dto';

@Injectable()
export class ProductionPlansService {
  constructor(
    @InjectRepository(ProductionPlan)
    private readonly planRepository: Repository<ProductionPlan>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * Todos los productos del tenant con su plan de producción para ese
   * período (0 si aún no se ha configurado), para poblar la vista de
   * Settings: un renglón editable por producto.
   */
  async findByPeriod(tenantId: string, periodId: string) {
    const [products, plans] = await Promise.all([
      this.productRepository.find({
        where: { strTenantId: tenantId },
        order: { strName: 'ASC' },
      }),
      this.planRepository.find({ where: { strTenantId: tenantId, periodId } }),
    ]);

    const planByProductId = new Map(plans.map((p) => [p.productId, p]));

    return products.map((product) => {
      const plan = planByProductId.get(product.strId);
      return {
        productId: product.strId,
        productName: product.strName,
        productCode: product.strCode,
        measurementUnit: product.strMeasurementUnit,
        plannedMonthlyUnits: plan ? parseFloat(plan.fltPlannedMonthlyUnits.toString()) : 0,
        planId: plan?.strId || null,
      };
    });
  }

  /** Plan de un producto puntual para un período, usado por el formulario de productos (solo lectura). */
  async findOneForProduct(tenantId: string, productId: string, periodId: string) {
    const plan = await this.planRepository.findOne({ where: { strTenantId: tenantId, productId, periodId } });
    return { plannedMonthlyUnits: plan ? parseFloat(plan.fltPlannedMonthlyUnits.toString()) : 0 };
  }

  async upsert(tenantId: string, dto: UpsertProductionPlanDto) {
    let plan = await this.planRepository.findOne({
      where: { strTenantId: tenantId, periodId: dto.periodId, productId: dto.productId },
    });

    if (plan) {
      plan.fltPlannedMonthlyUnits = dto.plannedMonthlyUnits;
    } else {
      plan = this.planRepository.create({
        strTenantId: tenantId,
        periodId: dto.periodId,
        productId: dto.productId,
        fltPlannedMonthlyUnits: dto.plannedMonthlyUnits,
      });
    }

    return this.planRepository.save(plan);
  }
}

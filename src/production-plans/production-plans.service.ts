import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ProductionPlan } from './entities/production-plan.entity';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { Category } from '../categories/entities/category.entity';
import { UpsertProductionPlanDto } from './dto/upsert-production-plan.dto';

type PlanItemType = 'product' | 'material' | 'material_t';

const num = (v: any): number => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class ProductionPlansService {
  constructor(
    @InjectRepository(ProductionPlan)
    private readonly planRepository: Repository<ProductionPlan>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Todos los ítems planificables del tenant con su plan para ese período:
   * productos (unidades a producir) y materiales / materiales compuestos
   * habilitados para reventa (presentaciones a vender). Un renglón por ítem,
   * con los datos que necesita la vista de Settings (filtros, totales) y el
   * documento del plan.
   */
  async findByPeriod(tenantId: string, periodId: string) {
    const [products, materials, materialsT, plans] = await Promise.all([
      this.productRepository.find({ where: { strTenantId: tenantId }, order: { strName: 'ASC' } }),
      this.dataSource.getRepository(Material).find({ where: { strTenantId: tenantId, blnForResale: true }, order: { strName: 'ASC' } }),
      this.dataSource.getRepository(MaterialT).find({ where: { strTenantId: tenantId, blnForResale: true }, order: { strName: 'ASC' } }),
      this.planRepository.find({ where: { strTenantId: tenantId, periodId } }),
    ]);

    const categoryIds = [
      ...products.map((p) => p.intCategoryId),
      ...materials.map((m) => m.categoryId),
      ...materialsT.map((m) => m.categoryId),
    ].filter((id): id is number => id !== null && id !== undefined);
    const categories = categoryIds.length
      ? await this.dataSource.getRepository(Category).find({ where: { id: In([...new Set(categoryIds)]) } })
      : [];
    const categoryName = new Map<number, string>(categories.map((c) => [c.id, c.name]));

    const planKey = (type: PlanItemType, id: string) => `${type}:${id}`;
    const planBy = new Map(plans.map((p) => [planKey((p.itemType || 'product') as PlanItemType, p.productId), p]));

    const productRows = products.map((p) => {
      const plan = planBy.get(planKey('product', p.strId));
      const units = plan ? num(plan.fltPlannedMonthlyUnits) : 0;
      const price = num(p.fltPrice);
      return {
        itemType: 'product' as PlanItemType,
        itemId: p.strId,
        productId: p.strId, // compatibilidad con clientes anteriores
        productName: p.strName,
        productCode: p.strCode,
        measurementUnit: p.strMeasurementUnit,
        categoryId: p.intCategoryId ?? null,
        categoryName: categoryName.get(p.intCategoryId) || null,
        status: p.strStatus,
        stock: num(p.ingQuantity) - num(p.ingReservedStock),
        unitPrice: price,
        plannedMonthlyUnits: units,
        plannedValue: units * price,
        isDefaultValue: false,
        planId: plan?.strId || null,
      };
    });

    const resaleRow = (m: Material | MaterialT, type: 'material' | 'material_t') => {
      const plan = planBy.get(planKey(type, m.strId));
      // Sin plan en este período: se usa lo configurado en el propio material
      const units = plan ? num(plan.fltPlannedMonthlyUnits) : num(m.ingPlannedMonthlyUnits);
      const factor = num(m.fltPresentationQuantity);
      const price = num(m.fltSalePrice);
      return {
        itemType: type as PlanItemType,
        itemId: m.strId,
        productId: m.strId,
        productName: m.strSalePresentation ? `${m.strName} - ${m.strSalePresentation}` : m.strName,
        productCode: m.strCode,
        measurementUnit: m.strSalePresentation || m.strUnitMeasure,
        categoryId: m.categoryId ?? null,
        categoryName: categoryName.get(m.categoryId) || null,
        status: m.strStatus,
        // Stock disponible expresado en presentaciones
        stock: factor > 0 ? Math.floor((num(m.ingQuantity) - num(m.ingReservedStock)) / factor) : 0,
        unitPrice: price,
        plannedMonthlyUnits: units,
        plannedValue: units * price,
        isDefaultValue: !plan && units > 0,
        planId: plan?.strId || null,
      };
    };

    return [
      ...productRows,
      ...materials.map((m) => resaleRow(m, 'material')),
      ...materialsT.map((m) => resaleRow(m, 'material_t')),
    ];
  }

  /** Plan de un producto puntual para un período, usado por el formulario de productos (solo lectura). */
  async findOneForProduct(tenantId: string, productId: string, periodId: string) {
    const plan = await this.planRepository.findOne({
      where: { strTenantId: tenantId, productId, periodId, itemType: 'product' },
    });
    return { plannedMonthlyUnits: plan ? num(plan.fltPlannedMonthlyUnits) : 0 };
  }

  async upsert(tenantId: string, dto: UpsertProductionPlanDto) {
    const itemType: PlanItemType = dto.itemType || 'product';
    let plan = await this.planRepository.findOne({
      where: { strTenantId: tenantId, periodId: dto.periodId, productId: dto.productId, itemType },
    });

    if (plan) {
      plan.fltPlannedMonthlyUnits = dto.plannedMonthlyUnits;
    } else {
      plan = this.planRepository.create({
        strTenantId: tenantId,
        periodId: dto.periodId,
        itemType,
        productId: dto.productId,
        fltPlannedMonthlyUnits: dto.plannedMonthlyUnits,
      });
    }
    const saved = await this.planRepository.save(plan);

    // Reventa: el precio sugerido del material usa ingPlannedMonthlyUnits;
    // se mantiene al día con lo planeado aquí.
    if (itemType === 'material') {
      await this.dataSource.getRepository(Material).update(
        { strId: dto.productId, strTenantId: tenantId },
        { ingPlannedMonthlyUnits: Math.round(dto.plannedMonthlyUnits) },
      );
    } else if (itemType === 'material_t') {
      await this.dataSource.getRepository(MaterialT).update(
        { strId: dto.productId, strTenantId: tenantId },
        { ingPlannedMonthlyUnits: Math.round(dto.plannedMonthlyUnits) },
      );
    }

    return saved;
  }
}

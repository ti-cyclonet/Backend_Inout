import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { ComboComponent, ComboItemType } from './entities/combo-component.entity';
import { ComponentFacts } from './combo-math';

const ENTITIES = { product: Product, material: Material, material_t: MaterialT } as const;
export const COMPONENT_TABLES: Record<ComboItemType, string> = {
  product: 'manufacturing.products',
  material: 'manufacturing.materials',
  material_t: 'manufacturing."materials-t"',
};

const num = (v: any) => Number(v) || 0;

export interface LoadedComponent {
  component: ComboComponent;
  entity: any;
  name: string;
  facts: ComponentFacts;
}

/** Nombre con el que se muestra/vende el componente. */
export function componentName(itemType: ComboItemType, entity: any, mode: 'SALE' | 'STOCK'): string {
  if (itemType === 'product' || mode === 'STOCK') return entity.strName;
  return `${entity.strName} - ${entity.strSalePresentation || ''}`.trim();
}

/**
 * Carga los ítems de los componentes de un combo y sus datos de precio, costo
 * y stock. Con `lock` bloquea las filas (dentro de una transacción). Lanza 400
 * si un componente ya no existe.
 */
export async function loadComponents(
  manager: EntityManager,
  tenantId: string,
  components: ComboComponent[],
  options: { lock?: boolean } = {},
): Promise<LoadedComponent[]> {
  const out: LoadedComponent[] = [];
  for (const component of components || []) {
    const itemType = component.strItemType;
    const Entity = ENTITIES[itemType];
    if (!Entity) throw new BadRequestException(`Tipo de componente no válido: ${itemType}`);
    const entity: any = await manager.findOne(Entity as any, {
      where: { strId: component.strItemId, strTenantId: tenantId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) throw new BadRequestException('Uno de los componentes del combo ya no existe. Revisa el combo.');

    const mode = component.strQuantityMode === 'STOCK' ? 'STOCK' : 'SALE';
    const isProduct = itemType === 'product';
    out.push({
      component,
      entity,
      name: componentName(itemType, entity, mode),
      facts: {
        itemType,
        quantityMode: mode,
        quantity: num(component.fltQuantity),
        listPrice: isProduct ? num(entity.fltPrice) : num(entity.fltSalePrice),
        stockUnitCost: isProduct ? num(entity.fltCost) : num(entity.fltPrice),
        presentationFactor: isProduct ? 1 : num(entity.fltPresentationQuantity) || 1,
        availableStock: num(entity.ingQuantity) - num(entity.ingReservedStock),
        madeToOrder: isProduct && !!entity.blnMadeToOrder,
      },
    });
  }
  return out;
}

/**
 * Valida la definición de componentes al crear/editar un combo:
 * - Al menos un componente, cantidades > 0, sin repetir el mismo ítem.
 * - Combo VIRTUAL: solo productos o materiales de reventa contados en
 *   presentaciones (se venden como líneas normales).
 * - Modo STOCK solo para materiales (insumos/empaque de kits).
 */
export function assertComponentsDefinition(
  type: 'VIRTUAL' | 'KIT',
  components: { itemType: string; itemId: string; quantity: number; quantityMode?: string }[],
): void {
  if (!Array.isArray(components) || components.length === 0) {
    throw new BadRequestException('Agrega al menos un componente al combo.');
  }
  const seen = new Set<string>();
  for (const c of components) {
    if (!['product', 'material', 'material_t'].includes(c.itemType)) {
      throw new BadRequestException(`Tipo de componente no válido: ${c.itemType}`);
    }
    if (!(Number(c.quantity) > 0)) throw new BadRequestException('Cada componente debe tener una cantidad mayor a cero.');
    const mode = c.quantityMode === 'STOCK' ? 'STOCK' : 'SALE';
    if (mode === 'STOCK' && c.itemType === 'product') {
      throw new BadRequestException('Los productos se cuentan en unidades de venta.');
    }
    if (mode === 'STOCK' && type === 'VIRTUAL') {
      throw new BadRequestException('Un combo virtual solo puede llevar productos o materiales de reventa (en presentaciones). Los insumos de empaque son para kits armados.');
    }
    const key = `${c.itemType}:${c.itemId}:${mode}`;
    if (seen.has(key)) throw new BadRequestException('Hay un componente repetido: suma las cantidades en una sola línea.');
    seen.add(key);
  }
}

/** Valida que los componentes de venta (SALE) de materiales sigan habilitados para reventa. */
export function assertSellableComponents(loaded: LoadedComponent[]): void {
  for (const l of loaded) {
    if (l.facts.itemType === 'product' || l.facts.quantityMode === 'STOCK') continue;
    if (!l.entity.blnForResale || !(num(l.entity.fltPresentationQuantity) > 0)) {
      throw new BadRequestException(`"${l.entity.strName}" no está habilitado para reventa: cuéntalo como insumo (unidad de medida) o habilita su reventa.`);
    }
  }
}

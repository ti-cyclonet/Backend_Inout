import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { normalizeItemType, SellableItemType } from './resale';

export interface StockLine {
  productId: string;
  quantity: number;
  productName?: string;
  /** 'product' (default), 'material' o 'material_t' (reventa). */
  itemType?: SellableItemType | string;
  unitPrice?: number;
}

/** Línea resuelta: cantidad convertida a la unidad en la que vive el stock. */
export interface ResolvedStockLine {
  itemType: SellableItemType;
  id: string;
  name: string;
  /** Cantidad vendida tal cual (unidades de producto o presentaciones). */
  quantity: number;
  /** Cantidad en la unidad del stock (para materiales: presentaciones × factor). */
  baseQuantity: number;
  /** Precio por unidad de stock (para el movimiento de Kardex). */
  baseUnitPrice: number;
  /** Fila leída (producto o material), con el stock al momento de resolver. */
  entity: any;
}

const ENTITIES = { product: Product, material: Material, material_t: MaterialT } as const;
const TABLES: Record<SellableItemType, string> = {
  product: 'manufacturing.products',
  material: 'manufacturing.materials',
  material_t: 'manufacturing."materials-t"',
};

interface ResolveOptions {
  /** Bloquea las filas (FOR UPDATE); requiere estar dentro de una transacción. */
  lock?: boolean;
  /** Exige que los materiales sigan habilitados para reventa (al vender/confirmar). */
  requireResale?: boolean;
  /** Ignora ítems que ya no existen (al cancelar/entregar pedidos viejos). */
  skipMissing?: boolean;
}

/**
 * Convierte las líneas de una venta/pedido a movimientos de stock. Un
 * material de reventa se vende por PRESENTACIÓN (ej. 2 "Bolsa 1 kg") pero su
 * stock vive en la unidad de medida (g), así que se multiplica por
 * fltPresentationQuantity.
 */
export async function resolveStockLines(
  manager: EntityManager,
  tenantId: string,
  lines: StockLine[],
  options: ResolveOptions = {},
): Promise<ResolvedStockLine[]> {
  const cache = new Map<string, any>();
  const resolved: ResolvedStockLine[] = [];

  for (const line of lines || []) {
    if (!line?.productId) continue;
    const itemType = normalizeItemType(line.itemType);
    const key = `${itemType}:${line.productId}`;

    let entity = cache.get(key);
    if (entity === undefined) {
      entity = await manager.findOne(ENTITIES[itemType] as any, {
        where: { strId: line.productId, strTenantId: tenantId },
        ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      cache.set(key, entity || null);
    }
    if (!entity) {
      if (options.skipMissing) continue;
      throw new NotFoundException(`Producto ${line.productName || line.productId} no encontrado`);
    }

    let factor = 1;
    if (itemType !== 'product') {
      factor = Number(entity.fltPresentationQuantity) || 0;
      if (options.requireResale && (!entity.blnForResale || factor <= 0)) {
        throw new BadRequestException(`"${entity.strName}" no está habilitado para reventa`);
      }
      if (factor <= 0) factor = 1;
    }

    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unitPrice) || 0;
    resolved.push({
      itemType,
      id: line.productId,
      name: itemType === 'product' ? entity.strName : `${entity.strName} - ${entity.strSalePresentation || ''}`.trim(),
      quantity,
      baseQuantity: quantity * factor,
      baseUnitPrice: unitPrice / factor,
      entity,
    });
  }

  return resolved;
}

/**
 * Verifica que haya stock DISPONIBLE (ingQuantity - ingReservedStock) para
 * todas las líneas, agrupando por ítem (el mismo puede venir en varias
 * líneas). Bloquea las filas (FOR UPDATE) para que dos ventas/confirmaciones
 * simultáneas no consuman el mismo stock: debe llamarse dentro de una
 * transacción. Lanza un 400 que lista TODOS los ítems sin stock suficiente.
 */
export async function assertStockAvailable(
  manager: EntityManager,
  tenantId: string,
  lines: StockLine[],
): Promise<ResolvedStockLine[]> {
  const resolved = await resolveStockLines(manager, tenantId, lines, { lock: true, requireResale: true });

  const totals = new Map<string, { line: ResolvedStockLine; entity: any; base: number; qty: number }>();
  for (const line of resolved) {
    const key = `${line.itemType}:${line.id}`;
    const prev = totals.get(key);
    totals.set(key, {
      line,
      entity: line.entity,
      base: (prev?.base || 0) + line.baseQuantity,
      qty: (prev?.qty || 0) + line.quantity,
    });
  }

  const shortages: string[] = [];
  for (const { line, entity, base, qty } of totals.values()) {
    const available = Number(entity.ingQuantity || 0) - Number(entity.ingReservedStock || 0);
    if (available < base) {
      // Se informa en la misma unidad en que se vende (presentaciones o unidades)
      const factor = line.quantity > 0 ? line.baseQuantity / line.quantity : 1;
      const availableUnits = Math.max(0, factor !== 1 ? Math.floor(available / factor) : available);
      shortages.push(`"${line.name}" (disponible: ${availableUnits}, solicitado: ${qty})`);
    }
  }

  if (shortages.length > 0) {
    throw new BadRequestException(`Stock insuficiente: ${shortages.join('; ')}`);
  }

  return resolved;
}

/**
 * Aplica un cambio de stock a cada línea resuelta. onHand/reserved son el
 * signo (+1 suma, -1 resta) sobre ingQuantity/ingReservedStock; las restas
 * nunca dejan valores negativos.
 */
export async function applyStockDelta(
  manager: EntityManager,
  tenantId: string,
  lines: ResolvedStockLine[],
  delta: { onHand?: 1 | -1; reserved?: 1 | -1 },
): Promise<void> {
  for (const line of lines) {
    const sets: string[] = [];
    if (delta.onHand) {
      sets.push(delta.onHand > 0
        ? `"ingQuantity" = COALESCE("ingQuantity", 0) + $1`
        : `"ingQuantity" = GREATEST(0, COALESCE("ingQuantity", 0) - $1)`);
    }
    if (delta.reserved) {
      sets.push(delta.reserved > 0
        ? `"ingReservedStock" = COALESCE("ingReservedStock", 0) + $1`
        : `"ingReservedStock" = GREATEST(0, COALESCE("ingReservedStock", 0) - $1)`);
    }
    if (sets.length === 0) continue;
    await manager.query(
      `UPDATE ${TABLES[line.itemType]} SET ${sets.join(', ')} WHERE "strId" = $2 AND "strTenantId" = $3`,
      [line.baseQuantity, line.id, tenantId],
    );
  }
}

/** Columna de InventoryMovement que referencia al ítem según su tipo. */
export function movementTarget(line: ResolvedStockLine): { strProductId?: string; strMaterialId?: string; strTransformedMaterialId?: string } {
  if (line.itemType === 'material') return { strMaterialId: line.id };
  if (line.itemType === 'material_t') return { strTransformedMaterialId: line.id };
  return { strProductId: line.id };
}

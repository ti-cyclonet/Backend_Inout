import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Product } from '../products/entities/product.entity';

export interface StockLine {
  productId: string;
  quantity: number;
  productName?: string;
}

/**
 * Verifica que haya stock DISPONIBLE (ingQuantity - ingReservedStock) para
 * todas las líneas, agrupando por producto (el mismo producto puede venir en
 * varias líneas). Bloquea las filas de producto (FOR UPDATE) para que dos
 * ventas/confirmaciones simultáneas no consuman el mismo stock: debe llamarse
 * dentro de una transacción. Lanza un 400 que lista TODOS los productos sin
 * stock suficiente, no solo el primero.
 */
export async function assertStockAvailable(
  manager: EntityManager,
  tenantId: string,
  lines: StockLine[],
): Promise<Map<string, Product>> {
  const requested = new Map<string, { quantity: number; name?: string }>();
  for (const line of lines) {
    if (!line.productId) continue;
    const qty = Number(line.quantity) || 0;
    const prev = requested.get(line.productId);
    requested.set(line.productId, {
      quantity: (prev?.quantity || 0) + qty,
      name: prev?.name || line.productName,
    });
  }

  const products = new Map<string, Product>();
  const shortages: string[] = [];

  for (const [productId, req] of requested) {
    const product = await manager.findOne(Product, {
      where: { strId: productId, strTenantId: tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!product) {
      throw new NotFoundException(`Producto ${req.name || productId} no encontrado`);
    }
    products.set(productId, product);

    const available =
      parseFloat((product.ingQuantity || 0).toString()) - parseFloat((product.ingReservedStock || 0).toString());
    if (available < req.quantity) {
      shortages.push(`"${product.strName}" (disponible: ${Math.max(0, available)}, solicitado: ${req.quantity})`);
    }
  }

  if (shortages.length > 0) {
    throw new BadRequestException(`Stock insuficiente: ${shortages.join('; ')}`);
  }

  return products;
}

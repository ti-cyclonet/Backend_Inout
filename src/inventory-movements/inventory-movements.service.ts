import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Material } from '../materials/entities/material.entity';

@Injectable()
export class InventoryMovementsService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly repository: Repository<InventoryMovement>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
  ) {}

  async findByMaterial(materialId: string, tenantId?: string) {
    const where: any = { strMaterialId: materialId };
    if (tenantId) {
      where.strTenantId = tenantId;
    }
    return this.repository.find({
      where,
      order: { dtmCreationDate: 'DESC' }
    });
  }

  async findByTransformedMaterial(transformedMaterialId: string, tenantId?: string) {
    const where: any = { strTransformedMaterialId: transformedMaterialId };
    if (tenantId) {
      where.strTenantId = tenantId;
    }
    return this.repository.find({
      where,
      order: { dtmCreationDate: 'DESC' }
    });
  }

  async findByProduct(productId: string, tenantId?: string) {
    const where: any = { strProductId: productId };
    if (tenantId) {
      where.strTenantId = tenantId;
    }
    return this.repository.find({
      where,
      order: { dtmCreationDate: 'DESC' }
    });
  }

  async create(data: Partial<InventoryMovement>) {
    const movement = this.repository.create(data);
    return this.repository.save(movement);
  }

  /**
   * Salida manual desde el kardex (ajuste, merma, devolución…): valida y
   * descuenta el stock del ítem. Materiales compuestos y productos llegan con
   * strTransformedMaterialId / strProductId (antes se enviaban como material y
   * la salida fallaba o quedaba en el kardex equivocado).
   * Las entradas sin documento van por el saldo inicial o el conteo físico.
   */
  async createAndUpdateStock(data: any) {
    const { strMaterialId, strTransformedMaterialId, strProductId, strType, fltQuantity, strTenantId } = data;

    if (strType === 'OUT' && !strMaterialId && (strTransformedMaterialId || strProductId)) {
      const table = strProductId ? 'manufacturing.products' : 'manufacturing."materials-t"';
      const id = strProductId || strTransformedMaterialId;
      return this.repository.manager.transaction(async (manager) => {
        const rows = await manager.query(
          `SELECT "ingQuantity" FROM ${table} WHERE "strId" = $1 AND "strTenantId" = $2 FOR UPDATE`,
          [id, strTenantId],
        );
        if (!rows.length) throw new BadRequestException(strProductId ? 'Producto no encontrado' : 'Material compuesto no encontrado');
        const currentStock = Number(rows[0].ingQuantity) || 0;
        if (currentStock < Number(fltQuantity)) throw new BadRequestException('Stock insuficiente para esta salida');
        await manager.query(`UPDATE ${table} SET "ingQuantity" = "ingQuantity" - $1 WHERE "strId" = $2`, [Number(fltQuantity), id]);
        const movement = manager.create(InventoryMovement, {
          ...data,
          strMaterialId: null,
          strTransformedMaterialId: strProductId ? null : id,
          strProductId: strProductId || null,
        });
        return manager.save(movement);
      });
    }

    // Validate stock for OUT movements
    if (strType === 'OUT' && strMaterialId) {
      const material = await this.materialRepository.findOne({
        where: { strId: strMaterialId, strTenantId },
      });

      if (!material) {
        throw new BadRequestException('Material no encontrado');
      }

      const currentStock = Number(material.ingQuantity) || 0;
      if (currentStock < Number(fltQuantity)) {
        throw new BadRequestException('Stock insuficiente para esta salida');
      }

      // Deduct stock
      material.ingQuantity = currentStock - Number(fltQuantity);
      await this.materialRepository.save(material);
    }

    // Create the movement record
    const movement = this.repository.create(data);
    return this.repository.save(movement);
  }
}

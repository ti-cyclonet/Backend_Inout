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
   * Create movement and update material stock accordingly.
   * For OUT movements: deducts from material stock.
   * For IN movements: adds to material stock.
   */
  async createAndUpdateStock(data: any) {
    const { strMaterialId, strType, fltQuantity, strTenantId } = data;

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

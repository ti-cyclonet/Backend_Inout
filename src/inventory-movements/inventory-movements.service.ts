import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';

@Injectable()
export class InventoryMovementsService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly repository: Repository<InventoryMovement>,
  ) {}

  async findByMaterial(materialId: string, tenantId?: string) {
    const where: any = { strMaterialId: materialId, strType: 'OUT' };
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
}

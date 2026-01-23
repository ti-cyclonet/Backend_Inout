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

  async findByMaterial(materialId: string) {
    return this.repository.find({
      where: { strMaterialId: materialId, strType: 'OUT' },
      order: { dtmCreationDate: 'DESC' }
    });
  }
}

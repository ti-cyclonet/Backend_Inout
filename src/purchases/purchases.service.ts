import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseRecord } from './entities/purchase-record.entity';
import { Material } from '../materials/entities/material.entity';
import { CreatePurchaseRecordDto } from './dto/create-purchase-record.dto';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseRecord)
    private purchaseRepository: Repository<PurchaseRecord>,
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
  ) {}

  async create(createDto: CreatePurchaseRecordDto, tenantId: string): Promise<PurchaseRecord> {
    // Crear registro de compra
    const purchase = this.purchaseRepository.create({
      strTenantId: tenantId,
      strMaterialId: createDto.materialId,
      strSupplierId: createDto.supplierId,
      dtmDate: new Date(createDto.date),
      fltQuantity: createDto.quantity,
      fltUnitPrice: createDto.unitPrice,
      strDocument: createDto.document,
    });

    const savedPurchase = await this.purchaseRepository.save(purchase);

    // Obtener el material
    const material = await this.materialRepository.findOne({
      where: { strId: createDto.materialId, strTenantId: tenantId }
    });

    if (material) {
      // Calcular nuevo stock
      const currentStock = Number(material.ingQuantity) || 0;
      const newStock = currentStock + Number(createDto.quantity);

      // Calcular precio ponderado
      const currentValue = currentStock * Number(material.fltPrice);
      const newValue = Number(createDto.quantity) * Number(createDto.unitPrice);
      const totalValue = currentValue + newValue;
      const weightedPrice = newStock > 0 ? totalValue / newStock : 0;

      // Actualizar material
      material.ingQuantity = newStock;
      material.fltPrice = weightedPrice;
      await this.materialRepository.save(material);
    }

    return savedPurchase;
  }

  async findByMaterial(materialId: string, tenantId: string): Promise<PurchaseRecord[]> {
    return this.purchaseRepository.find({
      where: { strMaterialId: materialId, strTenantId: tenantId },
      relations: ['supplier'],
      order: { dtmDate: 'DESC' },
    });
  }
}

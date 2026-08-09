import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseRecord } from './entities/purchase-record.entity';
import { Material } from '../materials/entities/material.entity';
import { CreatePurchaseRecordDto, CreateBulkPurchaseDto } from './dto/create-purchase-record.dto';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseRecord)
    private purchaseRepository: Repository<PurchaseRecord>,
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
    private dataSource: DataSource,
  ) {}

  async create(createDto: CreatePurchaseRecordDto, tenantId: string): Promise<PurchaseRecord> {
    // Crear registro de compra
    const purchase = this.purchaseRepository.create({
      strTenantId: tenantId,
      strMaterialId: createDto.materialId,
      strSupplierId: createDto.supplierId,
      dtmDate: createDto.date,
      fltQuantity: createDto.quantity,
      fltUnitPrice: createDto.unitPrice,
      strDocument: createDto.document,
      dtmExpirationDate: createDto.expirationDate || null,
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

  async createBulk(bulkDto: CreateBulkPurchaseDto, tenantId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const results: PurchaseRecord[] = [];

      for (const item of bulkDto.items) {
        // Create purchase record
        const purchase = this.purchaseRepository.create({
          strTenantId: tenantId,
          strMaterialId: item.materialId,
          strSupplierId: bulkDto.supplierId,
          dtmDate: bulkDto.date,
          fltQuantity: item.quantity,
          fltUnitPrice: item.unitPrice,
          strDocument: bulkDto.document,
          dtmExpirationDate: item.expirationDate || null,
        });

        const savedPurchase = await queryRunner.manager.save(purchase);
        results.push(savedPurchase);

        // Update material stock and weighted average price
        const material = await queryRunner.manager.findOne(Material, {
          where: { strId: item.materialId, strTenantId: tenantId },
        });

        if (material) {
          const currentStock = Number(material.ingQuantity) || 0;
          const newStock = currentStock + Number(item.quantity);

          const currentValue = currentStock * Number(material.fltPrice);
          const newValue = Number(item.quantity) * Number(item.unitPrice);
          const totalValue = currentValue + newValue;
          const weightedPrice = newStock > 0 ? totalValue / newStock : 0;

          material.ingQuantity = newStock;
          material.fltPrice = weightedPrice;
          await queryRunner.manager.save(material);
        }
      }

      await queryRunner.commitTransaction();

      return {
        message: `Entrada grupal registrada exitosamente (${results.length} materiales)`,
        count: results.length,
        document: bulkDto.document,
        purchases: results,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

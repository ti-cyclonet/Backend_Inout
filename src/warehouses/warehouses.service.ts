import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseLocation } from './entities/warehouse-location.entity';
import { StockTransfer } from './entities/stock-transfer.entity';
import { PhysicalCount, CountStatus } from './entities/physical-count.entity';
import { Material } from '../materials/entities/material.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse) private warehouseRepo: Repository<Warehouse>,
    @InjectRepository(WarehouseLocation) private locationRepo: Repository<WarehouseLocation>,
    @InjectRepository(StockTransfer) private transferRepo: Repository<StockTransfer>,
    @InjectRepository(PhysicalCount) private countRepo: Repository<PhysicalCount>,
    @InjectRepository(Material) private materialRepo: Repository<Material>,
    @InjectRepository(InventoryMovement) private movementRepo: Repository<InventoryMovement>,
  ) {}

  // ═══════ WAREHOUSES ═══════
  async createWarehouse(data: any, tenantId: string) {
    const warehouse = this.warehouseRepo.create({ ...data, tenantId });
    return this.warehouseRepo.save(warehouse);
  }

  async findAllWarehouses(tenantId: string) {
    return this.warehouseRepo.find({
      where: { tenantId, status: 'active' },
      relations: ['locations'],
      order: { createdAt: 'DESC' },
    });
  }

  async removeWarehouse(id: string, tenantId: string) {
    const wh = await this.warehouseRepo.findOne({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException('Almacén no encontrado');
    wh.status = 'inactive';
    return this.warehouseRepo.save(wh);
  }

  // ═══════ LOCATIONS ═══════
  async createLocation(data: any, tenantId: string) {
    const location = this.locationRepo.create({ ...data, tenantId });
    return this.locationRepo.save(location);
  }

  async findLocationsByWarehouse(warehouseId: string, tenantId: string) {
    return this.locationRepo.find({
      where: { warehouseId, tenantId, status: 'active' },
    });
  }

  // ═══════ TRANSFERS ═══════
  async createTransfer(data: any, tenantId: string) {
    // Validate material exists
    const material = await this.materialRepo.findOne({ where: { strId: data.materialId, strTenantId: tenantId } });
    if (!material) throw new NotFoundException('Material no encontrado');

    // Validate stock
    if (Number(material.ingQuantity) < Number(data.quantity)) {
      throw new BadRequestException('Stock insuficiente para la transferencia');
    }

    // Record transfer
    const transfer = this.transferRepo.create({
      tenantId,
      materialId: data.materialId,
      materialName: material.strName,
      fromWarehouseId: data.fromWarehouseId,
      fromWarehouseName: data.fromWarehouseName || '',
      fromLocationId: data.fromLocationId || null,
      toWarehouseId: data.toWarehouseId,
      toWarehouseName: data.toWarehouseName || '',
      toLocationId: data.toLocationId || null,
      quantity: data.quantity,
      notes: data.notes || null,
      status: 'completed',
    });

    const saved = await this.transferRepo.save(transfer);

    // Update material location
    material.strLocation = data.toWarehouseName || material.strLocation;
    await this.materialRepo.save(material);

    return { message: 'Transferencia registrada exitosamente', transfer: saved };
  }

  async findTransfers(tenantId: string) {
    return this.transferRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ═══════ PHYSICAL COUNT ═══════
  async createPhysicalCount(data: any, tenantId: string) {
    // Load all materials for the tenant
    const materials = await this.materialRepo.find({ where: { strTenantId: tenantId, strStatus: 'Active' } });

    const items = materials.map(m => ({
      materialId: m.strId,
      materialCode: m.strCode || '-',
      materialName: m.strName,
      systemStock: Number(m.ingQuantity) || 0,
      physicalStock: 0,
      difference: 0,
      unit: m.strUnitMeasure || 'und',
    }));

    const count = this.countRepo.create({
      tenantId,
      description: data.description || `Conteo físico ${new Date().toLocaleDateString('es-CO')}`,
      warehouseId: data.warehouseId || null,
      status: CountStatus.DRAFT,
      items,
      totalItems: items.length,
      countedItems: 0,
      discrepancies: 0,
      performedBy: data.performedBy || null,
    });

    return this.countRepo.save(count);
  }

  async findPhysicalCounts(tenantId: string) {
    return this.countRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async updatePhysicalCount(id: string, tenantId: string, data: any) {
    const count = await this.countRepo.findOne({ where: { id, tenantId } });
    if (!count) throw new NotFoundException('Conteo no encontrado');

    if (data.items) {
      count.items = data.items;
      count.countedItems = data.items.filter((i: any) => i.physicalStock > 0 || i.physicalStock === 0).length;
      count.discrepancies = data.items.filter((i: any) => i.difference !== 0).length;
    }
    if (data.status) count.status = data.status;
    if (data.status === CountStatus.COMPLETED) count.completedAt = new Date();

    return this.countRepo.save(count);
  }

  async applyPhysicalCount(id: string, tenantId: string) {
    const count = await this.countRepo.findOne({ where: { id, tenantId } });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    if (count.status === CountStatus.APPLIED) throw new BadRequestException('Este conteo ya fue aplicado');

    // Apply adjustments for items with discrepancies
    const adjustments = (count.items || []).filter(i => i.difference !== 0);

    for (const item of adjustments) {
      const material = await this.materialRepo.findOne({ where: { strId: item.materialId, strTenantId: tenantId } });
      if (material) {
        // Record movement
        await this.movementRepo.save(this.movementRepo.create({
          strTenantId: tenantId,
          strMaterialId: item.materialId,
          strType: item.difference > 0 ? 'IN' : 'OUT',
          strReason: 'ADJUSTMENT',
          fltQuantity: Math.abs(item.difference),
          fltUnitPrice: Number(material.fltPrice) || 0,
          strNotes: `Ajuste por conteo físico: ${count.description}`,
          dtmDate: new Date(),
        }));

        // Update stock
        material.ingQuantity = item.physicalStock;
        await this.materialRepo.save(material);
      }
    }

    count.status = CountStatus.APPLIED;
    count.appliedAt = new Date();
    await this.countRepo.save(count);

    return {
      message: `Conteo aplicado: ${adjustments.length} ajustes realizados`,
      adjustmentsCount: adjustments.length,
    };
  }
}

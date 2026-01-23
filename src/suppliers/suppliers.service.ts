import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CommonService } from '../common/common.service';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private supplierRepository: Repository<Supplier>,
    private commonService: CommonService,
  ) {}

  async findAll(tenantId: string): Promise<Supplier[]> {
    return this.supplierRepository.find({
      where: { strTenantId: tenantId, strStatus: 'active' },
      order: { strName: 'ASC' },
    });
  }

  async create(createSupplierDto: CreateSupplierDto, tenantId: string): Promise<Supplier> {
    // Generar código autoincremental
    const code = await this.generateSupplierCode(tenantId);

    const supplier = this.supplierRepository.create({
      strCode: code,
      strName: createSupplierDto.name,
      strContactName: createSupplierDto.contactName,
      strAddress: createSupplierDto.address,
      strDocumentType: createSupplierDto.documentType,
      strDocumentNumber: createSupplierDto.documentNumber,
      strContactEmail: createSupplierDto.contactEmail,
      strContactPhone: createSupplierDto.contactPhone,
      strStatus: createSupplierDto.status || 'active',
      strTenantId: tenantId,
    });

    return this.supplierRepository.save(supplier);
  }

  private async generateSupplierCode(tenantId: string): Promise<string> {
    const prefix = await this.commonService.getClientPrefix(tenantId);
    const lastSupplier = await this.supplierRepository
      .createQueryBuilder('supplier')
      .where('supplier.strTenantId = :tenantId', { tenantId })
      .andWhere('supplier.strCode LIKE :pattern', { pattern: `${prefix}-S-%` })
      .orderBy('supplier.strCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastSupplier && lastSupplier.strCode) {
      const match = lastSupplier.strCode.match(/-S-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}-S-${nextNumber.toString().padStart(5, '0')}`;
  }
}

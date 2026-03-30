import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { Product } from '../products/entities/product.entity';
import { CompositionTwo } from '../products/entities/composition-two.entity';
import { CompositionThree } from '../products/entities/composition-three.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(CompositionTwo)
    private compositionTwoRepository: Repository<CompositionTwo>,
    @InjectRepository(CompositionThree)
    private compositionThreeRepository: Repository<CompositionThree>,
    @InjectRepository(InventoryMovement)
    private inventoryMovementRepository: Repository<InventoryMovement>,
    private dataSource: DataSource,
  ) {}

  private async generateInvoiceCode(tenantId: string): Promise<string> {
    const prefix = await this.getContractPrefix(tenantId);
    
    const lastSale = await this.saleRepository
      .createQueryBuilder('sale')
      .where('sale.strTenantId = :tenantId', { tenantId })
      .andWhere('sale.strInvoiceCode IS NOT NULL')
      .andWhere('sale.strInvoiceCode LIKE :pattern', { pattern: `${prefix}-F-%` })
      .orderBy('sale.strInvoiceCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastSale?.strInvoiceCode) {
      const lastNumber = parseInt(lastSale.strInvoiceCode.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-F-${nextNumber.toString().padStart(5, '0')}`;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      const authorizaUrl = process.env.AUTHORIZA_URL || 'http://localhost:3000/api';
      const response = await fetch(`${authorizaUrl}/contracts/tenant/${tenantId}`);
      
      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'ABC';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }
    
    return 'ABC';
  }

  async create(createDto: CreateSaleDto, tenantId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { strProductId, dtmDate, fltQuantity, fltUnitPrice, customerName } = createDto;

      const product = await queryRunner.manager.findOne(Product, {
        where: { strId: strProductId, strTenantId: tenantId }
      });

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      if (parseFloat(product.ingQuantity.toString()) < parseFloat(fltQuantity.toString())) {
        throw new BadRequestException('Stock insuficiente del producto');
      }

      const invoiceCode = await this.generateInvoiceCode(tenantId);

      const sale = this.saleRepository.create({
        strTenantId: tenantId,
        strInvoiceCode: invoiceCode,
        strProductId: strProductId,
        dtmDate: dtmDate,
        fltQuantity: fltQuantity,
        fltUnitPrice: fltUnitPrice,
        customerName: customerName,
        items: createDto.items,
        subtotal: createDto.subtotal,
        tax: createDto.tax,
        total: createDto.total
      });
      const savedSale = await queryRunner.manager.save(sale);

      // Descontar stock del producto
      product.ingQuantity = parseFloat(product.ingQuantity.toString()) - parseFloat(fltQuantity.toString());
      await queryRunner.manager.save(product);

      // Registrar movimiento de producto
      await queryRunner.manager.save(InventoryMovement, {
        strTenantId: tenantId,
        strProductId: strProductId,
        strType: 'OUT',
        strReason: 'SALE',
        fltQuantity: fltQuantity,
        fltUnitPrice: fltUnitPrice,
        strReferenceId: savedSale.strId,
        strNotes: `Venta ${invoiceCode}`,
        dtmDate: dtmDate
      });

      await queryRunner.commitTransaction();
      return { message: 'Venta registrada exitosamente', sale: savedSale };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(tenantId: string) {
    const sales = await this.saleRepository
      .createQueryBuilder('sale')
      .where('sale.strTenantId = :tenantId', { tenantId })
      .orderBy('sale.dtmCreationDate', 'DESC')
      .getMany();

    // Cargar productos
    const salesWithProducts = await Promise.all(
      sales.map(async (sale) => {
        const product = await this.productRepository.findOne({
          where: { strId: sale.strProductId },
        });
        return { ...sale, product };
      })
    );

    return { data: salesWithProducts };
  }

  async findByProduct(productId: string) {
    return this.saleRepository.find({
      where: { strProductId: productId },
      order: { dtmCreationDate: 'DESC' },
    });
  }

  async getStats(tenantId: string) {
    const sales = await this.saleRepository.find({
      where: { strTenantId: tenantId },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => {
      const saleTotal = sale.total ? parseFloat(sale.total.toString()) : (parseFloat(sale.fltQuantity.toString()) * parseFloat(sale.fltUnitPrice.toString()));
      return sum + saleTotal;
    }, 0);
    const pendingSales = 0;

    return {
      totalSales,
      totalRevenue,
      pendingSales
    };
  }
}

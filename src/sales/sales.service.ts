import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { Product } from '../products/entities/product.entity';
import { CompositionTwo } from '../products/entities/composition-two.entity';
import { CompositionThree } from '../products/entities/composition-three.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { BusinessParamsService } from '../config/business-params.service';

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
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private dataSource: DataSource,
    private businessParamsService: BusinessParamsService,
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
      const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      
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

      // Obtener parámetros de negocio del período activo
      const params = await this.businessParamsService.getParams(tenantId);

      // Calcular subtotal, IVA/INC y total si no vienen del frontend
      let subtotal = createDto.subtotal || parseFloat(fltQuantity.toString()) * parseFloat(fltUnitPrice.toString());
      let tax = createDto.tax;
      let total = createDto.total;

      // Si el impuesto no fue enviado pero está configurado, calcularlo
      if ((tax === null || tax === undefined) && (params.IVA_PORCENTAJE > 0 || params.INC_PORCENTAJE > 0)) {
        const incRate = Number(params.INC_PORCENTAJE || 0);
        const ivaRate = Number(params.IVA_PORCENTAJE || 0);
        const effectiveRate = incRate > 0 ? incRate : ivaRate;
        tax = subtotal * (effectiveRate / 100);
        total = subtotal + tax;
      } else if (!total) {
        total = subtotal + (tax || 0);
      }

      // Validar descuento si viene en los items
      if (createDto.discount && params.PORCENTAJE_DESCUENTO_MAX < 100) {
        const discountPercent = (createDto.discount / subtotal) * 100;
        if (discountPercent > params.PORCENTAJE_DESCUENTO_MAX) {
          throw new BadRequestException(
            `El descuento (${discountPercent.toFixed(1)}%) excede el máximo permitido (${params.PORCENTAJE_DESCUENTO_MAX}%)`
          );
        }
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
        strCustomerId: createDto.customerId || null,
        items: createDto.items,
        subtotal: subtotal,
        tax: tax || 0,
        total: total
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

      // Calcular puntos de fidelidad (no transaccional)
      let loyaltyPoints = 0;
      try {
        loyaltyPoints = await this.businessParamsService.calculateLoyaltyPoints(tenantId, total);
      } catch {}

      return {
        message: 'Venta registrada exitosamente',
        sale: savedSale,
        appliedParams: {
          ivaPercent: params.IVA_PORCENTAJE,
          taxApplied: tax || 0,
          loyaltyPoints,
        }
      };
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
    // Ventas directas
    const sales = await this.saleRepository.find({
      where: { strTenantId: tenantId },
    });

    const directSalesCount = sales.length;
    const directSalesRevenue = sales.reduce((sum, sale) => {
      const saleTotal = sale.total ? parseFloat(sale.total.toString()) : (parseFloat(sale.fltQuantity.toString()) * parseFloat(sale.fltUnitPrice.toString()));
      return sum + saleTotal;
    }, 0);

    // Pedidos entregados/facturados (también cuentan como ingresos)
    const completedOrders = await this.orderRepository.find({
      where: {
        tenantId,
        status: In([OrderStatus.DELIVERED, OrderStatus.INVOICED]),
      },
    });

    const ordersCount = completedOrders.length;
    const ordersRevenue = completedOrders.reduce((sum, order) => {
      return sum + (parseFloat(order.total?.toString() || '0'));
    }, 0);

    // Pedidos pendientes (confirmados + en producción + listos)
    const pendingOrders = await this.orderRepository.count({
      where: {
        tenantId,
        status: In([OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY]),
      },
    });

    return {
      totalSales: directSalesCount + ordersCount,
      totalRevenue: directSalesRevenue + ordersRevenue,
      pendingSales: pendingOrders,
      // Desglose
      directSales: directSalesCount,
      directRevenue: directSalesRevenue,
      ordersSales: ordersCount,
      ordersRevenue: ordersRevenue,
    };
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LimitEnforcementService } from '../usage-counters/limit-enforcement.service';

@Injectable()
export class CustomersService {
  private authorizaApiUrl: string;

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly limitEnforcementService: LimitEnforcementService,
  ) {
    this.authorizaApiUrl = this.configService.get<string>('AUTHORIZA_API_URL') || 'http://localhost:3000/api';
  }

  async create(dto: CreateCustomerDto, tenantId: string): Promise<Customer> {
    try {
      // Generate customer code
      const customerCode = await this.generateCustomerCode(tenantId);
      
      const customer = this.customerRepository.create({
        potentialUserId: null,
        tenantId,
        customerCode,
        businessName: dto.businessName,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        documentNumber: dto.documentNumber,
        documentDv: dto.documentDv,
        personType: dto.personType,
        documentType: dto.documentType,
        firstName: dto.firstName,
        secondName: dto.secondName,
        firstSurname: dto.firstSurname,
        secondSurname: dto.secondSurname,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        maritalStatus: dto.maritalStatus,
        sex: dto.sex,
        status: 'ACTIVE',
        isActive: true,
      });

      return await this.customerRepository.save(customer);
    } catch (error) {
      throw new ConflictException('Error creating customer: ' + error.message);
    }
  }

  /**
   * Los clientes de InOut ya NO viven en una tabla local: son usuarios reales
   * de Authoriza (rol `clienteInout`, dependientes del tenant), lo que los
   * deja habilitados como potenciales usuarios del resto del ecosistema. Este
   * método reemplaza la lectura de la tabla `customer` local por una consulta
   * a Authoriza, filtrando los dependientes del tenant por ese rol.
   */
  async findByTenantId(tenantId: string): Promise<any[]> {
    return this.findClientsFromAuthoriza(tenantId);
  }

  async findById(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id, isActive: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async getCustomersWithDetails(tenantId: string): Promise<any[]> {
    // Ya vienen con todos los detalles de BasicData resueltos desde Authoriza.
    return this.findClientsFromAuthoriza(tenantId);
  }

  private async findClientsFromAuthoriza(tenantId: string): Promise<any[]> {
    try {
      const contractId = await this.getInoutContractId(tenantId);
      const query = contractId ? `?contractId=${contractId}` : '';
      const response = await firstValueFrom(
        this.httpService.get(`${this.authorizaApiUrl}/user-dependencies/principal/${tenantId}/roles${query}`),
      );
      const dependents: any[] = response.data || [];

      return dependents
        .filter((dep) => (dep.roles || []).some((r: any) => r.name === 'clienteInout'))
        .map((dep) => this.mapAuthorizaClientToCustomer(dep, tenantId));
    } catch (error) {
      console.error('Error obteniendo clientes (rol clienteInout) desde Authoriza:', error?.message);
      return [];
    }
  }

  private mapAuthorizaClientToCustomer(dep: any, tenantId: string): any {
    return {
      id: dep.userId,
      authorizaUserId: dep.userId,
      tenantId,
      customerCode: dep.code || null,
      businessName: dep.businessName || null,
      contactPerson: null,
      phone: dep.phone || null,
      email: dep.email,
      address: null,
      documentType: dep.documentType || null,
      documentNumber: dep.documentNumber || null,
      personType: dep.personType || null,
      firstName: dep.firstName || null,
      secondName: dep.secondName || null,
      firstSurname: dep.firstSurname || null,
      secondSurname: dep.secondSurname || null,
      status: dep.status,
      isActive: dep.isActive,
      createdAt: dep.createdAt,
    };
  }

  /** Contrato de InOut del tenant (necesario para filtrar los roles del dependiente por ese contrato). */
  private async getInoutContractId(tenantId: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.authorizaApiUrl}/contracts/tenant/${tenantId}/limits?application=Inout`),
      );
      return response.data?.contractId || null;
    } catch {
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    customer.isActive = false;
    await this.customerRepository.save(customer);
    if (customer.tenantId) {
      await this.limitEnforcementService.decrement(customer.tenantId, 'nClientes');
    }
  }

  private async generateCustomerCode(tenantId: string): Promise<string> {
    // Obtener el prefijo del contrato del tenant desde Authoriza
    const prefix = await this.getContractPrefix(tenantId);
    
    // Buscar el último cliente creado para este tenant
    const lastCustomer = await this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.tenantId = :tenantId', { tenantId })
      .andWhere('customer.customer_code IS NOT NULL')
      .andWhere('customer.customer_code LIKE :pattern', { pattern: `${prefix}-C-%` })
      .orderBy('customer.customer_code', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastCustomer && lastCustomer.customerCode) {
      const lastNumber = parseInt(lastCustomer.customerCode.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-C-${nextNumber.toString().padStart(5, '0')}`;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      // Consultar el prefijo del contrato desde Authoriza
      const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      
      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'ABC';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }
    
    // Fallback a ABC si hay error
    return 'ABC';
  }
}

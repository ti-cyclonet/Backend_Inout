import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class CustomersService {
  private authorizaApiUrl: string;

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.authorizaApiUrl = this.configService.get<string>('AUTHORIZA_API_URL') || 'http://localhost:3000/api';
  }

  async create(dto: CreateCustomerDto, tenantId: string): Promise<Customer> {
    try {
      // 1. Create potential user in Authoriza
      const potentialUserData = {
        email: dto.email,
        sourceApplication: 'InOut',
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        name: dto.personType === 'J' ? dto.businessName : 
              [dto.firstName, dto.secondName, dto.firstSurname, dto.secondSurname]
                .filter(Boolean).join(' '),
      };

      let potentialUserId = null;
      
      try {
        const fullUrl = `${this.authorizaApiUrl}/api/potential-users`;
        console.log('Full Authoriza URL:', this.authorizaApiUrl);
        console.log('Attempting to create potential user in Authoriza:', fullUrl);
        console.log('Payload:', potentialUserData);
        
        const response = await firstValueFrom(
          this.httpService.post(fullUrl, potentialUserData)
        );
        potentialUserId = response.data.id;
        console.log('Successfully created potential user with ID:', potentialUserId);
      } catch (authorizaError) {
        console.error('Failed to create potential user in Authoriza:', authorizaError.response?.data || authorizaError.message);
        // Continue without potential user ID
      }

      // 2. Create customer in InOut
      const customerCode = await this.generateCustomerCode(tenantId);
      
      const customer = this.customerRepository.create({
        potentialUserId,
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

  async findByTenantId(tenantId: string): Promise<Customer[]> {
    return this.customerRepository.find({
      where: { tenantId, isActive: true },
      order: { createdAt: 'DESC' },
    });
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
    const customers = await this.findByTenantId(tenantId);
    
    const customersWithDetails = await Promise.all(
      customers.map(async (customer) => {
        try {
          if (customer.potentialUserId) {
            const response = await firstValueFrom(
              this.httpService.get(`${this.authorizaApiUrl}/potential-users/${customer.potentialUserId}`)
            );
            const potentialUser = response.data;
            
            return {
              ...customer,
              potentialUserDetails: potentialUser,
            };
          }
          return customer;
        } catch (error) {
          return {
            ...customer,
            potentialUserDetails: null,
            error: 'Potential user not found',
          };
        }
      })
    );

    return customersWithDetails;
  }

  async remove(id: string): Promise<void> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    customer.isActive = false;
    await this.customerRepository.save(customer);
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
      const authorizaUrl = process.env.AUTHORIZA_URL || 'http://localhost:3000/api';
      const response = await fetch(`${authorizaUrl}/contracts/tenant/${tenantId}`);
      
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

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PeriodsService {
  private readonly authorizaUrl: string;

  constructor(private configService: ConfigService) {
    this.authorizaUrl = this.configService.get<string>('AUTHORIZA_API_URL') || 'http://localhost:3000';
  }

  async create(periodo: any, tenantId: string) {
    try {
      const payload = {
        name: periodo.nombre,
        startDate: periodo.fechaInicio,
        endDate: periodo.fechaFin,
        tenantId: tenantId
      };
      
      const response = await fetch(`${this.authorizaUrl}/api/periods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new HttpException('Error creating period in Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      throw new HttpException('Failed to connect to Authoriza service', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async createSubperiod(subperiodo: any, tenantId: string) {
    try {
      const payload = {
        name: subperiodo.nombre,
        startDate: subperiodo.fechaInicio,
        endDate: subperiodo.fechaFin,
        parentPeriodId: subperiodo.parentPeriodId,
        tenantId: tenantId
      };
      
      const response = await fetch(`${this.authorizaUrl}/api/periods/subperiods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new HttpException('Error creating subperiod in Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      throw new HttpException('Failed to connect to Authoriza service', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async activate(periodoId: string) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/periods/${periodoId}/activate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new HttpException('Error activating period in Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      throw new HttpException('Failed to connect to Authoriza service', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async remove(periodoId: string) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/periods/${periodoId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new HttpException('Error deleting period in Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      throw new HttpException('Failed to connect to Authoriza service', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async findAll(tenantId: string) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/periods`);
      
      if (!response.ok) {
        throw new HttpException('Error fetching periods from Authoriza', HttpStatus.BAD_GATEWAY);
      }

      const allPeriods = await response.json();
      // Filtrar solo periodos del tenant específico
      const tenantPeriods = allPeriods.filter(period => period.tenantId === tenantId);
      return tenantPeriods;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new HttpException('Authoriza service is not available', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new HttpException(`Failed to connect to Authoriza service: ${error.message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async getActivePeriod(tenantId: string) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/periods/active/tenant/${tenantId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null; // No active period found
        }
        throw new HttpException('Error fetching active period from Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new HttpException('Authoriza service is not available', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new HttpException(`Failed to connect to Authoriza service: ${error.message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async getCustomerParameters(periodId: string) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/customer-parameters-periods/period/${periodId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new HttpException('Error fetching customer parameters from Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      throw new HttpException('Failed to connect to Authoriza service', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
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
        tenantId: tenantId,
        source: 'INOUT',
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
        tenantId: tenantId,
        source: 'INOUT',
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
    let response: Response;
    try {
      response = await fetch(`${this.authorizaUrl}/api/periods/${periodoId}/activate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      throw new HttpException('Authoriza service is not available', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // Propagar el status y mensaje reales de Authoriza (p. ej. "No se puede
      // activar un subperíodo expirado", 400) en vez de siempre reportar 503
      // y ocultar la causa real al frontend.
      throw new HttpException(body?.message || 'Error activating period in Authoriza', response.status);
    }

    return body;
  }

  async update(periodoId: string, periodo: any) {
    let response: Response;
    try {
      const payload: any = {};
      if (periodo.nombre !== undefined) payload.name = periodo.nombre;
      if (periodo.fechaInicio !== undefined) payload.startDate = periodo.fechaInicio;
      if (periodo.fechaFin !== undefined) payload.endDate = periodo.fechaFin;

      response = await fetch(`${this.authorizaUrl}/api/periods/${periodoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new HttpException('Authoriza service is not available', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new HttpException(body?.message || 'Error updating period in Authoriza', response.status);
    }

    return body;
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
      // Filtrar en Authoriza por tenant Y por app: la tabla de periodos es
      // compartida con FactoNet, y sin el filtro de source aqui se veian (y
      // se podian anidar) periodos de FactoNet que compartian tenantId.
      const response = await fetch(`${this.authorizaUrl}/api/periods?tenantId=${encodeURIComponent(tenantId)}&source=INOUT`);

      if (!response.ok) {
        throw new HttpException('Error fetching periods from Authoriza', HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new HttpException('Authoriza service is not available', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new HttpException(`Failed to connect to Authoriza service: ${error.message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async getActivePeriod(tenantId: string) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/periods/active/tenant/${tenantId}?source=INOUT`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null; // No active period found
        }
        throw new HttpException('Error fetching active period from Authoriza', HttpStatus.BAD_GATEWAY);
      }

      const text = await response.text();
      if (!text) return null;
      
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error.code === 'ECONNREFUSED') {
        throw new HttpException('Authoriza service is not available', HttpStatus.SERVICE_UNAVAILABLE);
      }
      // Don't fail the whole app if period service is temporarily unavailable
      return null;
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
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CustomerParametersPeriodsService {
  private readonly authorizaUrl: string;

  constructor(private configService: ConfigService) {
    this.authorizaUrl = this.configService.get<string>('AUTHORIZA_API_URL') || 'http://localhost:3000';
  }

  async findByPeriod(periodId: string) {
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

  async create(createDto: any) {
    try {
      const response = await fetch(`${this.authorizaUrl}/api/customer-parameters-periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDto)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new HttpException(`Error creating customer parameter period: ${errorText}`, HttpStatus.BAD_GATEWAY);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in create:', error);
      throw new HttpException(`Failed to connect to Authoriza service: ${error.message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}

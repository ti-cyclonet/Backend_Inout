import { Injectable } from '@nestjs/common';

@Injectable()
export class CommonService {
  async getClientPrefix(tenantId: string): Promise<string> {
    try {
      const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      
      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'JMY';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }
    
    return 'JMY';
  }
}

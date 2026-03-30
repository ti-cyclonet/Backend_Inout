import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Usar basicDataId como tenantId principal, luego contractId como fallback
    const tenantId = payload.basicDataId || payload.tenantId || payload.contractId || payload.contract_id;
    return { 
      id: payload.sub, 
      email: payload.email, 
      tenantId: tenantId 
    };
  }
}

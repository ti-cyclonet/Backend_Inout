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
    // tenantId = dueño del contrato (lo emite Authoriza). NO usar contractId como
    // fallback (es otro namespace y contamina el scope de inventario).
    const tenantId = payload.tenantId || null;
    return {
      id: payload.sub,
      email: payload.email,
      tenantId: tenantId,
      contractId: payload.contractId || null,
      // No inventar 'viewer' por defecto: si no hay rol, se deja undefined y el
      // RolesGuard rechaza (en vez de conceder acceso silencioso).
      role: payload.role || payload.rol || undefined,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { assertKitchenScope } from './kitchen-scope';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    // El rol de cocina solo usa la pantalla de preparación
    assertKitchenScope(payload.role || payload.rol, req?.method, req?.originalUrl || req?.url);
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

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // De dónde tomar el token (por ej., en headers Authorization: Bearer <token>)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Si el token ya expiró, Passport lanzará 401 automáticamente
      ignoreExpiration: false,
      // Debe coincidir con tu "secret" en JwtModule.register()
      secretOrKey: process.env.JWT_SECRET || 'mi-secreto-en-desarrollo',
    });
  }

  // Este método se llama automáticamente si el token es válido
  async validate(payload: any) {
    // payload es lo que se firmó dentro del token, por ejemplo: { sub: userId, username: '...' }
    // Puedes opcionalmente verificar en BD si el usuario existe y retornar más info
    // Lo que retorne este método se inyecta en request.user
    return { userId: payload.sub, username: payload.username };
  }
}

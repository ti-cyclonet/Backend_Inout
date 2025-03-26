import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info) {
    // Si no hay token o es inválido, 'user' será null
    if (err || !user) {
      throw err || new UnauthorizedException('Token requerido o inválido');
    }
    return user;
  }
}

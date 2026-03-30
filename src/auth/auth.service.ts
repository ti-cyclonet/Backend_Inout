import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  // Este servicio ya no se usa porque la autenticación se hace en Authoriza
  // Mantenemos solo para compatibilidad
  async validateUser(email: string, password: string) {
    return null;
  }

  async login(user: any) {
    return null;
  }
}

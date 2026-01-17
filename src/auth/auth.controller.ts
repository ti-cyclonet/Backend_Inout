import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Este endpoint ya no se usa porque la autenticación se hace en Authoriza
  @Post('login')
  async login(@Body() credentials: { email: string; password: string }) {
    throw new UnauthorizedException('Use Authoriza service for authentication');
  }
}

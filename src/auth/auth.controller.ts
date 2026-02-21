import { Controller, Post, Body, UnauthorizedException, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Este endpoint ya no se usa porque la autenticación se hace en Authoriza
  @Post('login')
  async login(@Body() credentials: { email: string; password: string }) {
    throw new UnauthorizedException('Use Authoriza service for authentication');
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  async verify(@Request() req) {
    return {
      valid: true,
      user: req.user,
      tenantId: req.user.tenantId
    };
  }
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }), 
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'mi-secreto-en-desarrollo', 
      signOptions: { expiresIn: '1d' }, // Ejemplo: expira en 1 día
    }),
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService], // Exporta si lo quieres usar en otros módulos
})
export class AuthModule {}


import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator is present, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If user is not yet authenticated (JwtAuthGuard hasn't run yet or no auth),
    // let JwtAuthGuard handle the rejection
    if (!user) {
      return true;
    }

    if (!user.role) {
      throw new ForbiddenException('No tienes un rol asignado para acceder a este recurso.');
    }

    // Normalizar el rol de Authoriza a un rol interno de InOut.
    // Si el rol NO pertenece a InOut (ej. token de Shotra/Kiri/FactoNet), se
    // rechaza el acceso en vez de degradarlo silenciosamente a 'viewer'.
    const userRole = this.normalizeRole(user.role);

    if (!userRole) {
      throw new ForbiddenException(
        'Este token no tiene un rol válido de InOut. Inicia sesión en InOut para obtener acceso.',
      );
    }

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere rol: ${requiredRoles.join(' o ')}. Tu rol: ${userRole}.`,
      );
    }

    return true;
  }

  /**
   * Normalize Authoriza role names to InOut internal roles.
   * adminInout → admin, operatorInout → operator, viewerInout → viewer.
   * Devuelve null si el rol NO es de InOut (para rechazar tokens de otras apps).
   */
  private normalizeRole(role: string): string | null {
    const roleMap: Record<string, string> = {
      'adminInout': 'admin',
      'operatorInout': 'operator',
      'viewerInout': 'viewer',
      'admin': 'admin',
      'operator': 'operator',
      'viewer': 'viewer',
    };
    return roleMap[role] || null;
  }
}

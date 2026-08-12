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

    // adminInout has full access (maps to 'admin' internally)
    const userRole = this.normalizeRole(user.role);

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere rol: ${requiredRoles.join(' o ')}. Tu rol: ${userRole}.`,
      );
    }

    return true;
  }

  /**
   * Normalize Authoriza role names to InOut internal roles.
   * adminInout → admin
   * operatorInout → operator
   * viewerInout → viewer
   */
  private normalizeRole(role: string): string {
    const roleMap: Record<string, string> = {
      'adminInout': 'admin',
      'operatorInout': 'operator',
      'viewerInout': 'viewer',
      'admin': 'admin',
      'operator': 'operator',
      'viewer': 'viewer',
    };
    return roleMap[role] || 'viewer';
  }
}

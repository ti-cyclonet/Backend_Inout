import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LimitEnforcementService } from '../limit-enforcement.service';

export const FEATURE_KEY = 'requiredFeature';

/** La ruta requiere una función del plan (ej. 'fCredito'). Va con FeatureGuard, después del JwtAuthGuard. */
export const RequireFeature = (variableName: string) => SetMetadata(FEATURE_KEY, variableName);

/**
 * Bloquea (403 FEATURE_DISABLED) si el plan del negocio tiene la función
 * apagada. Si el paquete no la define, o no se puede consultar, deja pasar.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly limits: LimitEnforcementService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!feature) return true;
    const tenantId: string | undefined = context.switchToHttp().getRequest()?.user?.tenantId;
    if (!tenantId) return true;
    await this.limits.assertFeature(tenantId, feature);
    return true;
  }
}

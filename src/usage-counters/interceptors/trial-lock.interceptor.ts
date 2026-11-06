import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { LimitEnforcementService, STORE_PAUSED_MESSAGE, TRIAL_EXPIRED_MESSAGE } from '../limit-enforcement.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Prueba gratis vencida sin cambio de plan pedido: ninguna operación que
 * escriba (del equipo del negocio ni de sus clientes con sesión en la
 * tienda). Las consultas siguen, para que la app muestre el aviso y Mi plan.
 * Es global y corre después de los guards (ya hay request.user); las rutas
 * sin sesión (pedidos de invitados) se validan en su controlador.
 */
@Injectable()
export class TrialLockInterceptor implements NestInterceptor {
  constructor(private readonly limitEnforcementService: LimitEnforcementService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request?.user?.tenantId;
    if (!tenantId || !WRITE_METHODS.has(request.method)) return next.handle();
    const message = request.user?.role === 'clienteInout' ? STORE_PAUSED_MESSAGE : TRIAL_EXPIRED_MESSAGE;
    return from(this.limitEnforcementService.assertNotTrialLocked(tenantId, message)).pipe(mergeMap(() => next.handle()));
  }
}

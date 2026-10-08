import {
  Injectable,
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { LimitEnforcementService } from '../limit-enforcement.service';

/**
 * Devuelve el cupo que reservó LimitEnforcementGuard cuando la operación no se
 * completa.
 *
 * El guard suma al contador antes de que corran la validación del cuerpo y el
 * controlador; si alguno de los dos falla (un campo inválido, "stock
 * insuficiente"…), la operación no existió pero el contador ya había subido.
 * Así, intentos fallidos llenaban el plan: una cuenta con 10 ventas reales
 * llegó a 100/100 y quedó bloqueada. Este interceptor es global y solo actúa
 * si la petición trae una reserva (`request.limitReservation`).
 */
@Injectable()
export class LimitRollbackInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LimitRollbackInterceptor.name);

  constructor(private readonly limitEnforcementService: LimitEnforcementService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      catchError((error) => {
        const reserva = request?.limitReservation;
        if (!reserva) return throwError(() => error);
        request.limitReservation = null; // una sola devolución por petición
        return from(
          this.limitEnforcementService
            .decrement(reserva.tenantId, reserva.variableName)
            .catch((e) => this.logger.error(`No se pudo devolver el cupo de ${reserva.variableName}: ${e?.message}`)),
        ).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }
}

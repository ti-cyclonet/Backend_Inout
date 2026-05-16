import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { LimitEnforcementService } from '../limit-enforcement.service';
import { LIMIT_VARIABLE_KEY } from '../decorators/check-limit.decorator';
import { VARIABLE_DISPLAY_NAMES } from '../constants/resource-variable-map';

/**
 * Interceptor that adds usage warnings to the response when a tenant
 * is approaching their limit (>= 80%) after a successful creation.
 * 
 * This interceptor runs AFTER the request is processed and appends
 * a `_usageWarning` field to the response if the limit is near.
 */
@Injectable()
export class UsageWarningInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly limitEnforcementService: LimitEnforcementService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const variableName = this.reflector.get<string>(
      LIMIT_VARIABLE_KEY,
      context.getHandler(),
    );

    if (!variableName) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId || request.headers['x-tenant-id'];

    if (!tenantId) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const limitsResponse = await this.limitEnforcementService.fetchLimits(tenantId);
          const limitDef = limitsResponse.limits.find(
            (l) => l.variableName === variableName,
          );

          if (!limitDef) return;

          const counters = await this.limitEnforcementService.getCounters(tenantId);
          const counter = counters.find((c) => c.variableName === variableName);
          const currentCount = counter?.currentCount ?? 0;
          const percentage = limitDef.maxValue > 0
            ? Math.round((currentCount / limitDef.maxValue) * 100)
            : 0;

          if (percentage >= 80 && responseData && typeof responseData === 'object') {
            responseData._usageWarning = {
              variableName,
              displayName: limitDef.displayName || VARIABLE_DISPLAY_NAMES[variableName] || variableName,
              currentCount,
              maxValue: limitDef.maxValue,
              percentage,
              message: percentage >= 100
                ? `Has alcanzado el límite de ${limitDef.displayName || variableName}`
                : `Estás cerca del límite de ${limitDef.displayName || variableName} (${percentage}%)`,
            };
          }
        } catch {
          // Silently ignore - warnings are non-critical
        }
      }),
    );
  }
}

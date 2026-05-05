import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LimitEnforcementService } from '../limit-enforcement.service';
import { LIMIT_VARIABLE_KEY } from '../decorators/check-limit.decorator';

@Injectable()
export class LimitEnforcementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limitEnforcementService: LimitEnforcementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const variableName = this.reflector.get<string>(
      LIMIT_VARIABLE_KEY,
      context.getHandler(),
    );

    // If no @CheckLimit decorator is present, allow the request
    if (!variableName) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId || request.headers['x-tenant-id'];

    // If no tenantId available, allow the request (auth guard should handle this)
    if (!tenantId) {
      return true;
    }

    // This will throw ForbiddenException if limit is reached
    await this.limitEnforcementService.validateAndIncrement(
      tenantId,
      variableName,
    );

    return true;
  }
}

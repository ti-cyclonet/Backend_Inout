import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const GetTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;
    
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID not found in token');
    }
    
    return tenantId;
  },
);
import { Controller, Get, Module, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { PaymentReferencesService } from './payment-references.service';
import { duplicateMessage } from './payment-reference';

/** Para avisar en pantalla, antes de guardar, que un soporte ya se usó. */
@Controller('payment-references')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentReferencesController {
  constructor(private readonly refs: PaymentReferencesService) {}

  @Get('check')
  @Roles('admin', 'operator')
  async check(@GetTenantId() tenantId: string, @Query('ref') ref: string) {
    const uses = await this.refs.findUses(tenantId, ref);
    return { used: uses.length > 0, uses: uses.slice(0, 3), message: uses.length ? duplicateMessage(String(ref).trim(), uses[0]) : null };
  }
}

@Module({
  controllers: [PaymentReferencesController],
  providers: [PaymentReferencesService],
  exports: [PaymentReferencesService],
})
export class PaymentReferencesModule {}

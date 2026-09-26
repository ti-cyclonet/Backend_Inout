import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { Actor, CreditService } from './credit.service';
import {
  AssignCreditLimitDto, CreateCreditRequestDto, DecideCreditDto, RegisterPaymentDto,
  SuspendCreditDto, ValidateCreditDto, VoidReceivableDto,
} from './dto/credit.dto';

const actorOf = (req: Request): Actor => {
  const u = req.user as any;
  return { id: u?.id || null, email: u?.email || null };
};

/**
 * Crédito a clientes y cartera. Solicitar, validar, asignar cupo y
 * registrar abonos: admin u operador. Aprobar/rechazar, suspender y anular
 * cuentas por cobrar: solo admin.
 */
@Controller('credit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  // ── Cuentas de crédito ──
  @Get('accounts')
  @Roles('admin', 'operator', 'viewer')
  listAccounts(@GetTenantId() tenantId: string) {
    return this.creditService.listAccounts(tenantId);
  }

  @Get('accounts/:id')
  @Roles('admin', 'operator', 'viewer')
  getAccount(@GetTenantId() tenantId: string, @Param('id') id: string) {
    return this.creditService.getAccount(tenantId, id);
  }

  @Post('accounts')
  @Roles('admin', 'operator')
  createRequest(@GetTenantId() tenantId: string, @Req() req: Request, @Body() dto: CreateCreditRequestDto) {
    return this.creditService.createRequest(tenantId, actorOf(req), dto);
  }

  @Patch('accounts/:id/validate')
  @Roles('admin', 'operator')
  validate(@GetTenantId() tenantId: string, @Req() req: Request, @Param('id') id: string, @Body() dto: ValidateCreditDto) {
    return this.creditService.validate(tenantId, actorOf(req), id, dto);
  }

  @Patch('accounts/:id/assign')
  @Roles('admin', 'operator')
  assign(@GetTenantId() tenantId: string, @Req() req: Request, @Param('id') id: string, @Body() dto: AssignCreditLimitDto) {
    return this.creditService.assignLimit(tenantId, actorOf(req), id, dto);
  }

  @Patch('accounts/:id/decision')
  @Roles('admin')
  decide(@GetTenantId() tenantId: string, @Req() req: Request, @Param('id') id: string, @Body() dto: DecideCreditDto) {
    return this.creditService.decide(tenantId, actorOf(req), id, dto);
  }

  @Patch('accounts/:id/suspension')
  @Roles('admin')
  suspend(@GetTenantId() tenantId: string, @Req() req: Request, @Param('id') id: string, @Body() dto: SuspendCreditDto) {
    return this.creditService.setSuspended(tenantId, actorOf(req), id, dto);
  }

  // ── Elegibilidad para vender a crédito ──
  @Get('customers/:customerId/eligibility')
  @Roles('admin', 'operator', 'viewer')
  eligibility(@GetTenantId() tenantId: string, @Param('customerId') customerId: string) {
    return this.creditService.eligibility(tenantId, customerId);
  }

  @Get('customers/:customerId/statement')
  @Roles('admin', 'operator', 'viewer')
  statement(@GetTenantId() tenantId: string, @Param('customerId') customerId: string) {
    return this.creditService.customerStatement(tenantId, customerId);
  }

  // ── Cartera ──
  @Get('portfolio/summary')
  @Roles('admin', 'operator', 'viewer')
  summary(@GetTenantId() tenantId: string) {
    return this.creditService.summary(tenantId);
  }

  @Get('receivables')
  @Roles('admin', 'operator', 'viewer')
  listReceivables(
    @GetTenantId() tenantId: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.creditService.listReceivables(tenantId, { customerId, status, overdue });
  }

  @Get('receivables/:id')
  @Roles('admin', 'operator', 'viewer')
  getReceivable(@GetTenantId() tenantId: string, @Param('id') id: string) {
    return this.creditService.getReceivable(tenantId, id);
  }

  @Post('receivables/:id/payments')
  @Roles('admin', 'operator')
  registerPayment(@GetTenantId() tenantId: string, @Req() req: Request, @Param('id') id: string, @Body() dto: RegisterPaymentDto) {
    return this.creditService.registerPayment(tenantId, actorOf(req), id, dto);
  }

  @Patch('receivables/:id/void')
  @Roles('admin')
  voidReceivable(@GetTenantId() tenantId: string, @Param('id') id: string, @Body() dto: VoidReceivableDto) {
    return this.creditService.voidReceivable(tenantId, id, dto);
  }
}

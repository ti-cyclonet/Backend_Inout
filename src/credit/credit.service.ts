import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CreditAccount, CreditRequestStatus } from './entities/credit-account.entity';
import { Receivable, ReceivableStatus } from './entities/receivable.entity';
import { ReceivablePayment } from './entities/receivable-payment.entity';
import {
  AssignCreditLimitDto, CreateCreditRequestDto, DecideCreditDto, RegisterPaymentDto,
  SuspendCreditDto, ValidateCreditDto, VoidReceivableDto,
} from './dto/credit.dto';

export interface Actor {
  id?: string | null;
  email?: string | null;
}

const OPEN_STATUSES = [ReceivableStatus.PENDIENTE, ReceivableStatus.PARCIAL];
const IN_PROGRESS = [CreditRequestStatus.SOLICITADA, CreditRequestStatus.VALIDADA, CreditRequestStatus.CUPO_ASIGNADO];

const num = (v: any): number => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);

/** Fecha de hoy en Colombia (UTC-5), AAAA-MM-DD. */
export function todayCo(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}

/**
 * Crédito a clientes y cartera (cuentas por cobrar).
 *
 * Flujo del cupo: SOLICITADA → VALIDADA → CUPO_ASIGNADO → APROBADA/RECHAZADA.
 * Una venta a crédito exige: crédito aprobado y no suspendido, cupo
 * disponible (cupo aprobado − saldo pendiente) suficiente y cero facturas
 * vencidas. Se valida con la fila de la cuenta bloqueada (FOR UPDATE) para
 * que dos ventas simultáneas no superen el cupo.
 */
@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(CreditAccount) private readonly accountRepo: Repository<CreditAccount>,
    @InjectRepository(Receivable) private readonly receivableRepo: Repository<Receivable>,
    @InjectRepository(ReceivablePayment) private readonly paymentRepo: Repository<ReceivablePayment>,
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════ Cuentas de crédito (flujo) ═══════════════════════

  private pushHistory(account: CreditAccount, actor: Actor, action: string, detail?: string) {
    account.history = [
      ...(account.history || []),
      { at: new Date().toISOString(), action, byUserId: actor?.id || null, byEmail: actor?.email || null, detail },
    ];
  }

  private async findAccount(tenantId: string, id: string): Promise<CreditAccount> {
    const account = await this.accountRepo.findOne({ where: { id, tenantId } });
    if (!account) throw new NotFoundException('Cuenta de crédito no encontrada');
    return account;
  }

  private assertStatus(account: CreditAccount, expected: CreditRequestStatus, action: string) {
    if (account.requestStatus !== expected) {
      throw new BadRequestException(`No se puede ${action}: la solicitud está en estado ${account.requestStatus}.`);
    }
  }

  async listAccounts(tenantId: string) {
    const accounts = await this.accountRepo.find({ where: { tenantId }, order: { updatedAt: 'DESC' } });
    const usage = await this.usageByCustomer(this.dataSource.manager, tenantId, accounts.map((a) => a.customerId));
    return accounts.map((a) => this.decorateAccount(a, usage.get(a.customerId)));
  }

  async getAccount(tenantId: string, id: string) {
    const account = await this.findAccount(tenantId, id);
    const usage = await this.usageByCustomer(this.dataSource.manager, tenantId, [account.customerId]);
    return this.decorateAccount(account, usage.get(account.customerId));
  }

  private decorateAccount(a: CreditAccount, u?: { outstanding: number; overdueCount: number; overdueAmount: number }) {
    const outstanding = u?.outstanding || 0;
    const limit = num(a.approvedLimit);
    return {
      ...a,
      approvedLimit: limit,
      requestedAmount: num(a.requestedAmount),
      proposedLimit: a.proposedLimit === null ? null : num(a.proposedLimit),
      outstanding,
      available: Math.max(0, round2(limit - outstanding)),
      overdueCount: u?.overdueCount || 0,
      overdueAmount: u?.overdueAmount || 0,
      isActive: limit > 0 && !a.suspended,
    };
  }

  async createRequest(tenantId: string, actor: Actor, dto: CreateCreditRequestDto) {
    let account = await this.accountRepo.findOne({ where: { tenantId, customerId: dto.customerId } });
    if (account && IN_PROGRESS.includes(account.requestStatus)) {
      throw new ConflictException('Este cliente ya tiene una solicitud de crédito en trámite.');
    }
    if (!account) {
      account = this.accountRepo.create({
        tenantId,
        customerId: dto.customerId,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail || null,
        approvedLimit: 0,
        approvedTermDays: 0,
        history: [],
      });
    }
    // Nuevo trámite (primera vez o ajuste de cupo): las condiciones
    // aprobadas vigentes se conservan hasta que se apruebe el nuevo.
    account.customerName = dto.customerName;
    if (dto.customerEmail) account.customerEmail = dto.customerEmail;
    account.requestStatus = CreditRequestStatus.SOLICITADA;
    account.requestedAmount = dto.requestedAmount;
    account.requestedTermDays = dto.requestedTermDays;
    account.requestNotes = dto.notes?.trim() || null;
    account.validation = null;
    account.proposedLimit = null;
    account.proposedTermDays = null;
    account.rejectionReason = null;
    this.pushHistory(account, actor, 'SOLICITUD', `Solicita ${money(dto.requestedAmount)} a ${dto.requestedTermDays} días`);
    return this.accountRepo.save(account);
  }

  async validate(tenantId: string, actor: Actor, id: string, dto: ValidateCreditDto) {
    const account = await this.findAccount(tenantId, id);
    this.assertStatus(account, CreditRequestStatus.SOLICITADA, 'validar');
    const internalHistory = await this.internalHistory(tenantId, account.customerId);
    account.validation = {
      identityVerified: dto.identityVerified,
      referencesVerified: dto.referencesVerified,
      paymentCapacityVerified: dto.paymentCapacityVerified,
      observations: dto.observations?.trim() || null,
      internalHistory,
    };
    if (dto.meetsRequirements) {
      account.requestStatus = CreditRequestStatus.VALIDADA;
      this.pushHistory(account, actor, 'VALIDACION', 'Cumple requisitos');
    } else {
      account.requestStatus = CreditRequestStatus.RECHAZADA;
      account.rejectionReason = dto.observations?.trim() || 'No cumple los requisitos de validación';
      this.pushHistory(account, actor, 'RECHAZO', `En validación: ${account.rejectionReason}`);
    }
    return this.accountRepo.save(account);
  }

  async assignLimit(tenantId: string, actor: Actor, id: string, dto: AssignCreditLimitDto) {
    const account = await this.findAccount(tenantId, id);
    this.assertStatus(account, CreditRequestStatus.VALIDADA, 'asignar el cupo');
    account.proposedLimit = dto.limit;
    account.proposedTermDays = dto.termDays;
    account.requestStatus = CreditRequestStatus.CUPO_ASIGNADO;
    this.pushHistory(account, actor, 'ASIGNACION', `Cupo ${money(dto.limit)} a ${dto.termDays} días`);
    return this.accountRepo.save(account);
  }

  async decide(tenantId: string, actor: Actor, id: string, dto: DecideCreditDto) {
    const account = await this.findAccount(tenantId, id);
    this.assertStatus(account, CreditRequestStatus.CUPO_ASIGNADO, 'aprobar o rechazar');
    if (dto.approve) {
      account.approvedLimit = num(account.proposedLimit);
      account.approvedTermDays = account.proposedTermDays || 30;
      account.approvedAt = new Date();
      account.requestStatus = CreditRequestStatus.APROBADA;
      account.suspended = false;
      this.pushHistory(account, actor, 'APROBACION', `Cupo ${money(account.approvedLimit)} a ${account.approvedTermDays} días`);
    } else {
      if (!dto.reason?.trim()) throw new BadRequestException('Indica el motivo del rechazo.');
      account.requestStatus = CreditRequestStatus.RECHAZADA;
      account.rejectionReason = dto.reason.trim();
      this.pushHistory(account, actor, 'RECHAZO', account.rejectionReason);
    }
    return this.accountRepo.save(account);
  }

  async setSuspended(tenantId: string, actor: Actor, id: string, dto: SuspendCreditDto) {
    const account = await this.findAccount(tenantId, id);
    if (dto.suspended && !dto.reason?.trim()) throw new BadRequestException('Indica el motivo de la suspensión.');
    account.suspended = dto.suspended;
    this.pushHistory(account, actor, dto.suspended ? 'SUSPENSION' : 'REACTIVACION', dto.reason?.trim());
    return this.accountRepo.save(account);
  }

  /** Compras y cartera del cliente con este negocio (se congela al validar). */
  private async internalHistory(tenantId: string, customerId: string) {
    const [sales] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total FROM manufacturing.sales WHERE "strTenantId" = $1 AND "strCustomerId" = $2`,
      [tenantId, customerId],
    );
    const [orders] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total FROM manufacturing.orders
       WHERE "tenantId" = $1 AND "customerId" = $2 AND status IN ('DELIVERED', 'INVOICED')`,
      [tenantId, customerId],
    );
    const usage = (await this.usageByCustomer(this.dataSource.manager, tenantId, [customerId])).get(customerId);
    return {
      purchasesCount: (sales?.count || 0) + (orders?.count || 0),
      purchasesTotal: round2(num(sales?.total) + num(orders?.total)),
      outstanding: usage?.outstanding || 0,
      overdueCount: usage?.overdueCount || 0,
    };
  }

  // ═══════════════════════ Elegibilidad y venta a crédito ═══════════════════════

  private async usageByCustomer(manager: EntityManager, tenantId: string, customerIds: string[]) {
    const result = new Map<string, { outstanding: number; overdueCount: number; overdueAmount: number }>();
    if (!customerIds.length) return result;
    const today = todayCo();
    const rows: any[] = await manager.query(
      `SELECT "customerId",
              COALESCE(SUM(balance), 0) AS outstanding,
              COUNT(*) FILTER (WHERE "dueDate" < $3)::int AS overdue_count,
              COALESCE(SUM(balance) FILTER (WHERE "dueDate" < $3), 0) AS overdue_amount
         FROM manufacturing.receivables
        WHERE "tenantId" = $1 AND "customerId" = ANY($2) AND status IN ('PENDIENTE', 'PARCIAL')
        GROUP BY "customerId"`,
      [tenantId, customerIds, today],
    );
    rows.forEach((r) => result.set(r.customerId, {
      outstanding: round2(num(r.outstanding)),
      overdueCount: r.overdue_count || 0,
      overdueAmount: round2(num(r.overdue_amount)),
    }));
    return result;
  }

  /** Para la UI de venta: ¿puede comprar a crédito? (y por qué no). */
  async eligibility(tenantId: string, customerId: string) {
    const account = await this.accountRepo.findOne({ where: { tenantId, customerId } });
    const usage = (await this.usageByCustomer(this.dataSource.manager, tenantId, [customerId])).get(customerId);
    const limit = num(account?.approvedLimit);
    const outstanding = usage?.outstanding || 0;
    const available = Math.max(0, round2(limit - outstanding));
    let reason: string | null = null;
    if (!account || limit <= 0) reason = 'El cliente no tiene un crédito aprobado.';
    else if (account.suspended) reason = 'El crédito del cliente está suspendido.';
    else if ((usage?.overdueCount || 0) > 0) reason = `Tiene ${usage!.overdueCount} factura(s) vencida(s) por ${money(usage!.overdueAmount)}.`;
    else if (available <= 0) reason = 'No tiene cupo disponible.';
    return {
      hasAccount: !!account,
      accountId: account?.id || null,
      requestStatus: account?.requestStatus || null,
      approvedLimit: limit,
      termDays: account?.approvedTermDays || 0,
      outstanding,
      available,
      overdueCount: usage?.overdueCount || 0,
      overdueAmount: usage?.overdueAmount || 0,
      eligible: !reason,
      reason,
    };
  }

  /**
   * Crea la cuenta por cobrar de una venta/pedido a crédito dentro de la
   * transacción del llamador, validando crédito, mora y cupo con la cuenta
   * bloqueada. Lanza 400 con el motivo si no procede.
   */
  async createReceivableForCreditSale(
    manager: EntityManager,
    tenantId: string,
    data: { customerId: string | null; customerName: string; sourceType: 'SALE' | 'ORDER'; sourceId: string; documentCode: string; amount: number; issueDate?: string },
  ): Promise<Receivable> {
    if (!data.customerId) {
      throw new BadRequestException('Para vender a crédito selecciona un cliente registrado.');
    }
    const account = await manager.findOne(CreditAccount, {
      where: { tenantId, customerId: data.customerId },
      lock: { mode: 'pessimistic_write' },
    });
    const limit = num(account?.approvedLimit);
    if (!account || limit <= 0) throw new BadRequestException(`${data.customerName} no tiene un crédito aprobado. Solo se le puede vender de contado.`);
    if (account.suspended) throw new BadRequestException(`El crédito de ${data.customerName} está suspendido. Solo se le puede vender de contado.`);

    const usage = (await this.usageByCustomer(manager, tenantId, [data.customerId])).get(data.customerId);
    if ((usage?.overdueCount || 0) > 0) {
      throw new BadRequestException(
        `${data.customerName} tiene ${usage!.overdueCount} factura(s) vencida(s) por ${money(usage!.overdueAmount)}. Solo se le puede vender de contado hasta que se ponga al día.`,
      );
    }
    const available = round2(limit - (usage?.outstanding || 0));
    const amount = round2(num(data.amount));
    if (amount > available) {
      throw new BadRequestException(`Cupo insuficiente: disponible ${money(Math.max(0, available))}, valor ${money(amount)}.`);
    }

    const issueDate = data.issueDate || todayCo();
    const termDays = account.approvedTermDays || 30;
    return manager.save(Receivable, manager.create(Receivable, {
      tenantId,
      customerId: data.customerId,
      customerName: data.customerName,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      documentCode: data.documentCode,
      issueDate,
      dueDate: addDays(issueDate, termDays),
      termDays,
      amount,
      paidAmount: 0,
      balance: amount,
      status: ReceivableStatus.PENDIENTE,
    }));
  }

  // ═══════════════════════ Cartera ═══════════════════════

  private decorateReceivable(r: Receivable, today = todayCo()) {
    const balance = num(r.balance);
    const open = OPEN_STATUSES.includes(r.status);
    const daysToDue = daysBetween(today, r.dueDate);
    return {
      ...r,
      amount: num(r.amount),
      paidAmount: num(r.paidAmount),
      balance,
      daysOverdue: open && daysToDue < 0 ? -daysToDue : 0,
      daysToDue: open ? daysToDue : null,
      isOverdue: open && daysToDue < 0,
    };
  }

  async listReceivables(tenantId: string, filters: { customerId?: string; status?: string; overdue?: string }) {
    const where: any = { tenantId };
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status === 'OPEN') where.status = In(OPEN_STATUSES);
    else if (filters.status) where.status = filters.status;
    const rows = await this.receivableRepo.find({ where, order: { dueDate: 'ASC' } });
    const today = todayCo();
    const decorated = rows.map((r) => this.decorateReceivable(r, today));
    return filters.overdue === 'true' ? decorated.filter((r) => r.isOverdue) : decorated;
  }

  async getReceivable(tenantId: string, id: string) {
    const r = await this.receivableRepo.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Cuenta por cobrar no encontrada');
    const payments = await this.paymentRepo.find({ where: { tenantId, receivableId: id }, order: { paymentDate: 'ASC', createdAt: 'ASC' } });
    return { ...this.decorateReceivable(r), payments: payments.map((p) => ({ ...p, amount: num(p.amount) })) };
  }

  async registerPayment(tenantId: string, actor: Actor, id: string, dto: RegisterPaymentDto) {
    return this.dataSource.transaction(async (manager) => {
      const r = await manager.findOne(Receivable, { where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!r) throw new NotFoundException('Cuenta por cobrar no encontrada');
      if (!OPEN_STATUSES.includes(r.status)) throw new BadRequestException(`La cuenta ${r.documentCode} está ${r.status.toLowerCase()}.`);
      const amount = round2(num(dto.amount));
      const balance = num(r.balance);
      if (amount > balance + 0.005) throw new BadRequestException(`El abono (${money(amount)}) supera el saldo (${money(balance)}).`);

      await manager.save(ReceivablePayment, manager.create(ReceivablePayment, {
        tenantId,
        receivableId: r.id,
        amount,
        method: dto.method as any,
        reference: dto.reference?.trim() || null,
        paymentDate: dto.paymentDate || todayCo(),
        notes: dto.notes?.trim() || null,
        createdByUserId: actor?.id || null,
        createdByEmail: actor?.email || null,
      }));
      r.paidAmount = round2(num(r.paidAmount) + amount);
      r.balance = round2(Math.max(0, balance - amount));
      r.status = r.balance <= 0.005 ? ReceivableStatus.PAGADA : ReceivableStatus.PARCIAL;
      await manager.save(r);
      return this.decorateReceivable(r);
    });
  }

  /** Anular (error de registro): solo sin abonos. */
  async voidReceivable(tenantId: string, id: string, dto: VoidReceivableDto) {
    const r = await this.receivableRepo.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Cuenta por cobrar no encontrada');
    if (num(r.paidAmount) > 0) throw new BadRequestException('No se puede anular una cuenta que ya tiene abonos.');
    if (!OPEN_STATUSES.includes(r.status)) throw new BadRequestException('La cuenta ya no está abierta.');
    r.status = ReceivableStatus.ANULADA;
    r.balance = 0;
    r.voidReason = dto.reason.trim();
    return this.receivableRepo.save(r);
  }

  /** Resumen de cartera: saldos, vencida y antigüedad. */
  async summary(tenantId: string) {
    const today = todayCo();
    const open = (await this.receivableRepo.find({ where: { tenantId, status: In(OPEN_STATUSES) } })).map((r) => this.decorateReceivable(r, today));
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const byCustomer = new Map<string, { customerId: string; customerName: string; balance: number; overdue: number; count: number }>();
    for (const r of open) {
      if (!r.isOverdue) aging.current += r.balance;
      else if (r.daysOverdue <= 30) aging.d1_30 += r.balance;
      else if (r.daysOverdue <= 60) aging.d31_60 += r.balance;
      else if (r.daysOverdue <= 90) aging.d61_90 += r.balance;
      else aging.d90_plus += r.balance;
      const c = byCustomer.get(r.customerId) || { customerId: r.customerId, customerName: r.customerName, balance: 0, overdue: 0, count: 0 };
      c.balance += r.balance;
      if (r.isOverdue) c.overdue += r.balance;
      c.count++;
      byCustomer.set(r.customerId, c);
    }
    Object.keys(aging).forEach((k) => ((aging as any)[k] = round2((aging as any)[k])));
    const total = round2(open.reduce((s, r) => s + r.balance, 0));
    const overdue = round2(total - aging.current);
    const accounts = await this.accountRepo.find({ where: { tenantId } });
    const activeAccounts = accounts.filter((a) => num(a.approvedLimit) > 0 && !a.suspended);
    const totalLimit = round2(activeAccounts.reduce((s, a) => s + num(a.approvedLimit), 0));
    return {
      total,
      overdue,
      current: aging.current,
      openCount: open.length,
      overdueCount: open.filter((r) => r.isOverdue).length,
      dueSoonCount: open.filter((r) => !r.isOverdue && (r.daysToDue ?? 99) <= 7).length,
      aging,
      topDebtors: [...byCustomer.values()]
        .map((c) => ({ ...c, balance: round2(c.balance), overdue: round2(c.overdue) }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5),
      credit: {
        activeAccounts: activeAccounts.length,
        pendingRequests: accounts.filter((a) => IN_PROGRESS.includes(a.requestStatus)).length,
        totalLimit,
        utilization: totalLimit > 0 ? round2((total / totalLimit) * 100) : 0,
      },
    };
  }

  /** Estado de cuenta de un cliente: crédito, facturas y abonos. */
  async customerStatement(tenantId: string, customerId: string) {
    const account = await this.accountRepo.findOne({ where: { tenantId, customerId } });
    const receivables = await this.listReceivables(tenantId, { customerId });
    const payments = receivables.length
      ? await this.paymentRepo.find({ where: { tenantId, receivableId: In(receivables.map((r) => r.id)) }, order: { paymentDate: 'ASC' } })
      : [];
    return {
      account: account ? (await this.getAccount(tenantId, account.id)) : null,
      eligibility: await this.eligibility(tenantId, customerId),
      receivables,
      payments: payments.map((p) => ({ ...p, amount: num(p.amount) })),
    };
  }
}

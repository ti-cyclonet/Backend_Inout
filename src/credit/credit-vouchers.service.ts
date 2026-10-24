import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Actor, CreditService } from './credit.service';
import { CreditRemindersService } from './credit-reminders.service';
import { ReceivableVoucher } from './entities/receivable-voucher.entity';
import { Receivable } from './entities/receivable.entity';
import { PAYMENT_METHODS } from './entities/receivable-payment.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MarketplaceConfigService } from '../marketplace-config/marketplace-config.service';
import { resolvePaymentOptions } from '../orders/payment-plans';

const VOUCHER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VOUCHER_MAX_BYTES = 5 * 1024 * 1024;
/** Medios que puede elegir el cliente al subir un comprobante. */
const CUSTOMER_METHODS = ['TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'TARJETA', 'OTRO'];
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface VoucherInput { amount?: unknown; method?: string; reference?: string }

/**
 * Pago de cartera por el cliente: desde el enlace del recordatorio ve cuánto
 * debe y sube el comprobante; el negocio lo verifica en Cartera y ahí se
 * registra el abono (con la imputación a intereses y capital de siempre).
 */
@Injectable()
export class CreditVouchersService {
  constructor(
    @InjectRepository(ReceivableVoucher) private readonly voucherRepo: Repository<ReceivableVoucher>,
    @InjectRepository(Receivable) private readonly receivableRepo: Repository<Receivable>,
    private readonly creditService: CreditService,
    private readonly reminders: CreditRemindersService,
    private readonly cloudinary: CloudinaryService,
    private readonly marketplaceConfig: MarketplaceConfigService,
  ) {}

  /** Vista pública del enlace de pago (sin datos internos). */
  async publicView(token: string) {
    const { entity, view } = await this.creditService.findByPayToken(token);
    const [brand, config, vouchers] = await Promise.all([
      this.reminders.brand(entity.tenantId),
      this.marketplaceConfig.getConfig(entity.tenantId).catch(() => null),
      this.voucherRepo.find({ where: { receivableId: entity.id }, order: { createdAt: 'DESC' } }),
    ]);
    const pending = vouchers.filter((v) => v.status === 'PENDIENTE_VERIFICACION').reduce((s, v) => s + Number(v.amount), 0);
    return {
      store: { name: brand.name, logoUrl: brand.logoUrl, slug: config?.slug || null },
      customerName: (view.customerName || '').split(' | ')[0],
      documentCode: view.documentCode,
      status: view.status,
      dueDate: view.dueDate,
      daysToDue: view.daysToDue,
      daysOverdue: view.daysOverdue,
      isOverdue: view.isOverdue,
      amount: view.amount,
      paidAmount: view.paidAmount,
      balance: view.balance,
      interestPending: view.interestPending,
      totalDue: view.totalDue,
      pendingVerification: round2(pending),
      /** Datos de pago de la tienda (cuentas, Nequi…) para consignar. */
      paymentInstructions: resolvePaymentOptions(config?.paymentOptions).instructions,
      vouchers: vouchers.map((v) => ({
        amount: Number(v.amount), method: v.method, status: v.status, rejectReason: v.rejectReason, createdAt: v.createdAt,
      })),
    };
  }

  /** El cliente sube el comprobante de un pago: queda por verificar. */
  async submit(token: string, input: VoucherInput, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Adjunta la foto del comprobante de pago.');
    if (!VOUCHER_TYPES.includes(file.mimetype) || file.size > VOUCHER_MAX_BYTES) {
      throw new BadRequestException('El comprobante debe ser una imagen JPG, PNG o WEBP de máximo 5 MB.');
    }
    const { entity, view } = await this.creditService.findByPayToken(token);
    if (!['PENDIENTE', 'PARCIAL'].includes(entity.status)) throw new BadRequestException('Esta cuenta ya no tiene saldo pendiente.');
    const method = String(input?.method || '');
    if (!CUSTOMER_METHODS.includes(method)) throw new BadRequestException('Medio de pago no válido.');
    const amount = round2(Number(input?.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('El valor del pago debe ser mayor a cero.');

    // No se aceptan más comprobantes pendientes que lo adeudado
    const pending = await this.voucherRepo.find({ where: { receivableId: entity.id, status: 'PENDIENTE_VERIFICACION' } });
    const pendingTotal = pending.reduce((s, v) => s + Number(v.amount), 0);
    if (round2(amount + pendingTotal) > view.totalDue + 0.99) {
      throw new BadRequestException(pendingTotal > 0
        ? 'Ya hay comprobantes por verificar que cubren lo que debes.'
        : 'El valor supera lo que debes.');
    }

    const uploaded = await this.cloudinary.uploadImageFromBuffer(file.buffer, 'inout/credit-vouchers', entity.tenantId);
    const saved = await this.voucherRepo.save(this.voucherRepo.create({
      tenantId: entity.tenantId,
      receivableId: entity.id,
      amount,
      method: method as any,
      reference: String(input?.reference || '').trim().slice(0, 100) || null,
      voucherUrl: uploaded.secure_url,
      status: 'PENDIENTE_VERIFICACION',
    }));
    return { id: saved.id, amount: Number(saved.amount), status: saved.status };
  }

  /** Comprobantes del negocio (Cartera), con el documento y el cliente. */
  async list(tenantId: string, filters: { status?: string; receivableId?: string }) {
    const where: any = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.receivableId) where.receivableId = filters.receivableId;
    const vouchers = await this.voucherRepo.find({ where, order: { createdAt: 'DESC' }, take: 200 });
    const receivables = vouchers.length
      ? await this.receivableRepo.find({ where: { tenantId, id: In([...new Set(vouchers.map((v) => v.receivableId))]) } })
      : [];
    const byId = new Map(receivables.map((r) => [r.id, r]));
    return vouchers.map((v) => ({
      ...v,
      amount: Number(v.amount),
      documentCode: byId.get(v.receivableId)?.documentCode || null,
      customerName: (byId.get(v.receivableId)?.customerName || '').split(' | ')[0] || null,
    }));
  }

  /** Verificar registra el abono por el valor del comprobante; rechazar pide motivo. */
  async review(tenantId: string, actor: Actor, id: string, action: 'VERIFY' | 'REJECT', reason?: string) {
    const v = await this.voucherRepo.findOne({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Comprobante no encontrado');
    if (v.status !== 'PENDIENTE_VERIFICACION') throw new BadRequestException('Este comprobante ya fue revisado.');
    if (action !== 'VERIFY' && action !== 'REJECT') throw new BadRequestException('Acción no válida.');

    if (action === 'REJECT') {
      const why = String(reason || '').trim();
      if (why.length < 5) throw new BadRequestException('Indica el motivo del rechazo (mínimo 5 caracteres).');
      v.status = 'RECHAZADO';
      v.rejectReason = why.slice(0, 300);
    } else {
      const method = PAYMENT_METHODS.includes(v.method as any) ? v.method : 'OTRO';
      const result: any = await this.creditService.registerPayment(tenantId, actor, v.receivableId, {
        amount: Number(v.amount),
        method,
        reference: v.reference || undefined,
        notes: 'Comprobante subido por el cliente desde el enlace de pago',
      } as any);
      v.status = 'VERIFICADO';
      v.paymentId = result?.paymentId || null;
    }
    v.reviewedBy = actor?.email || actor?.id || null;
    v.reviewedAt = new Date();
    return this.voucherRepo.save(v);
  }
}

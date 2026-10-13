import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { GiftCard, GiftCardMovement, GiftCardMovementType } from './gift-card.entity';
import {
  allocateGiftCards,
  effectiveStatus,
  expiryFrom,
  generateGiftCardCode,
  GIFT_CARD_ITEM_TYPE,
  GIFT_CARD_LIMITS,
  GIFT_CARD_PRODUCT_ID,
  giftCardLineName,
  GiftCardOptions,
  isGiftCardLine,
  normalizeGiftCardCode,
  resolveGiftCardOptions,
  validateGiftCardLine,
} from './gift-cards';
import { Order } from '../entities/order.entity';
import { OrderPayment } from '../entities/order-payment.entity';
import { MarketplaceConfigService } from '../../marketplace-config/marketplace-config.service';

/** Cuenta de cliente de la tienda (token clienteInout). */
export interface StoreCustomer {
  id: string;
  email?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class GiftCardsService {
  constructor(
    @InjectRepository(GiftCard) private readonly cards: Repository<GiftCard>,
    @InjectRepository(GiftCardMovement) private readonly movements: Repository<GiftCardMovement>,
    private readonly marketplaceConfigService: MarketplaceConfigService,
  ) {}

  async getOptions(tenantId: string): Promise<GiftCardOptions> {
    return resolveGiftCardOptions((await this.marketplaceConfigService.getConfig(tenantId))?.giftCards);
  }

  // ─── Compra ───

  /**
   * Bonos del carrito: valida cada uno contra la tienda y deja la línea con el
   * precio y nombre del servidor (nunca los del navegador). Devuelve las líneas
   * de bonos y las demás por separado (los bonos no tocan stock ni promociones).
   */
  async prepareLines<T extends { itemType?: string }>(tenantId: string, items: T[]): Promise<{ giftLines: any[]; otherItems: T[] }> {
    const gifts = (items || []).filter(isGiftCardLine);
    const otherItems = (items || []).filter((i) => !isGiftCardLine(i));
    if (!gifts.length) return { giftLines: [], otherItems };
    if (gifts.length > GIFT_CARD_LIMITS.perOrder) throw new BadRequestException(`Máximo ${GIFT_CARD_LIMITS.perOrder} bonos por pedido.`);
    const options = await this.getOptions(tenantId);
    const giftLines = gifts.map((raw: any) => {
      const g = validateGiftCardLine({ ...(raw.giftCard || {}), amount: raw.giftCard?.amount ?? raw.unitPrice }, options);
      return {
        productId: GIFT_CARD_PRODUCT_ID,
        itemType: GIFT_CARD_ITEM_TYPE,
        productName: giftCardLineName(g),
        quantity: 1,
        unitPrice: g.amount,
        subtotal: g.amount,
        giftCard: g,
      };
    });
    return { giftLines, otherItems };
  }

  /** Crea los bonos PENDIENTES del pedido y deja su id en cada línea. */
  async createForOrder(manager: EntityManager, order: Order, purchaser: { userId: string | null; name: string | null }) {
    const lines: any[] = (order.items || []).filter(isGiftCardLine);
    for (const line of lines) {
      const g = line.giftCard;
      const card = await manager.save(manager.create(GiftCard, {
        tenantId: order.tenantId,
        code: await this.uniqueCode(manager),
        amount: g.amount,
        balance: g.amount,
        status: 'PENDIENTE',
        purchaseOrderId: order.id,
        purchaserUserId: purchaser.userId,
        purchaserName: purchaser.name?.slice(0, 150) || null,
        recipientName: g.recipientName,
        recipientEmail: g.recipientEmail,
        recipientPhone: g.recipientPhone,
        senderName: g.senderName,
        message: g.message,
      }));
      line.giftCardId = card.id;
      await this.log(manager, card, 'EMISION', 0, order.id, `Comprado en el pedido ${order.orderCode}`);
    }
    if (lines.length) await manager.save(order);
  }

  private async uniqueCode(manager: EntityManager): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = generateGiftCardCode();
      if (!(await manager.findOne(GiftCard, { where: { code }, select: ['id'] }))) return code;
    }
    throw new BadRequestException('No se pudo generar el código del bono. Intenta de nuevo.');
  }

  /**
   * Activa los bonos que compró este pedido: se llama cuando el pedido queda
   * pagado o se factura. La vigencia corre desde aquí.
   */
  async activateForOrder(manager: EntityManager, order: Order, actorId: string | null = null) {
    const pending = await manager.find(GiftCard, { where: { purchaseOrderId: order.id, status: 'PENDIENTE' } });
    if (!pending.length) return;
    const options = await this.getOptions(order.tenantId);
    const now = new Date();
    for (const card of pending) {
      card.status = 'ACTIVO';
      card.activatedAt = now;
      card.expiresAt = expiryFrom(now, options.validityMonths);
      await manager.save(card);
      await this.log(manager, card, 'ACTIVACION', 0, order.id, 'Pago del pedido completo', actorId);
    }
  }

  /**
   * Pedido cancelado: los bonos que compró quedan anulados y lo que se pagó
   * con bonos vuelve a cada bono (sus pagos quedan rechazados).
   */
  async onOrderCancelled(manager: EntityManager, order: Order, actorId: string | null) {
    const bought = await manager.find(GiftCard, { where: { purchaseOrderId: order.id, status: In(['PENDIENTE', 'ACTIVO']) } });
    for (const card of bought) {
      card.status = 'ANULADO';
      card.cancelReason = `Pedido ${order.orderCode} cancelado`;
      await manager.save(card);
      await this.log(manager, card, 'ANULACION', 0, order.id, card.cancelReason, actorId);
    }
    const paid = await manager.find(OrderPayment, { where: { orderId: order.id, method: 'BONO' as any, status: 'VERIFICADO' } });
    for (const p of paid) {
      const card = await manager.findOne(GiftCard, { where: { id: p.reference || '', tenantId: order.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (card) {
        card.balance = round2(Number(card.balance) + Number(p.amount));
        await manager.save(card);
        await this.log(manager, card, 'DEVOLUCION', Number(p.amount), order.id, `Pedido ${order.orderCode} cancelado`, actorId);
      }
      p.status = 'RECHAZADO';
      p.rejectReason = 'Pedido cancelado: el valor volvió al bono.';
      await manager.save(p);
    }
    return paid.length > 0;
  }

  // ─── Uso (solo clientes registrados) ───

  /** Bonos que puede usar esta cuenta: los suyos y los enviados a su correo. */
  async listMine(tenantId: string, customer: StoreCustomer) {
    const email = (customer.email || '').toLowerCase();
    const rows = await this.cards.find({
      where: [
        { tenantId, recipientUserId: customer.id },
        ...(email ? [{ tenantId, recipientEmail: email }] : []),
      ],
      order: { expiresAt: 'ASC', createdAt: 'ASC' },
    });
    return rows
      .filter((c) => !c.recipientUserId || c.recipientUserId === customer.id)
      .map((c) => this.publicView(c));
  }

  /** El cliente escribe el código que le compartieron: el bono queda en su cuenta. */
  async claim(tenantId: string, customer: StoreCustomer, rawCode: string) {
    const code = normalizeGiftCardCode(rawCode);
    const card = code ? await this.cards.findOne({ where: { code, tenantId } }) : null;
    if (!card) throw new NotFoundException('No encontramos un bono con ese código en esta tienda.');
    this.assertOwner(card, customer);
    if (card.status === 'PENDIENTE') throw new BadRequestException('Este bono todavía no está activo: se activa cuando se confirme el pago de quien lo compró.');
    if (card.status === 'ANULADO') throw new BadRequestException('Este bono fue anulado.');
    if (!card.recipientUserId) {
      card.recipientUserId = customer.id;
      card.claimedAt = new Date();
      await this.cards.save(card);
      await this.log(this.cards.manager, card, 'RECLAMO', 0, null, 'Reclamado con el código');
    }
    return this.publicView(card);
  }

  /**
   * Paga parte o todo un pedido con los bonos escogidos (dentro de la
   * transacción del pedido, con los bonos bloqueados). Devuelve lo aplicado.
   */
  async lockForRedemption(manager: EntityManager, tenantId: string, customer: StoreCustomer, ids: string[]) {
    const unique = [...new Set((ids || []).filter((x) => typeof x === 'string'))].slice(0, GIFT_CARD_LIMITS.perOrder);
    if (!unique.length) return [];
    const rows = await manager.find(GiftCard, { where: { id: In(unique), tenantId }, lock: { mode: 'pessimistic_write' } });
    if (rows.length !== unique.length) throw new BadRequestException('Alguno de los bonos no existe en esta tienda.');
    const now = new Date();
    for (const c of rows) {
      this.assertOwner(c, customer);
      const st = effectiveStatus(c, now);
      if (st !== 'ACTIVO') {
        const why = { PENDIENTE: 'todavía no está activo', AGOTADO: 'ya no tiene saldo', VENCIDO: 'está vencido', ANULADO: 'fue anulado' }[st as string] || 'no se puede usar';
        throw new BadRequestException(`El bono ${c.code} ${why}.`);
      }
    }
    // Primero los que vencen antes
    return rows.sort((a, b) => new Date(a.expiresAt || 0).getTime() - new Date(b.expiresAt || 0).getTime());
  }

  allocate(total: number, cards: GiftCard[]) {
    return allocateGiftCards(total, cards.map((c) => ({ id: c.id, balance: Number(c.balance) })));
  }

  /** Descuenta del saldo, deja el pago VERIFICADO del pedido (método BONO) y el movimiento. */
  async redeem(manager: EntityManager, order: Order, customer: StoreCustomer, cards: GiftCard[], allocation: { id: string; amount: number }[]) {
    for (const a of allocation) {
      const card = cards.find((c) => c.id === a.id)!;
      card.balance = round2(Number(card.balance) - a.amount);
      if (!card.recipientUserId) {
        card.recipientUserId = customer.id;
        card.claimedAt = new Date();
      }
      await manager.save(card);
      await manager.save(manager.create(OrderPayment, {
        tenantId: order.tenantId,
        orderId: order.id,
        amount: a.amount,
        method: 'BONO' as any,
        reference: card.id,
        notes: `Bono ${card.code}`,
        source: 'CLIENTE',
        status: 'VERIFICADO',
        verifiedBy: 'BONO',
        verifiedAt: new Date(),
      }));
      await this.log(manager, card, 'USO', -a.amount, order.id, `Pago del pedido ${order.orderCode}`, customer.id);
    }
  }

  private assertOwner(card: GiftCard, customer: StoreCustomer) {
    if (card.recipientUserId && card.recipientUserId !== customer.id) {
      throw new ForbiddenException('Este bono ya está en la cuenta de otra persona.');
    }
    const email = (customer.email || '').toLowerCase();
    if (!card.recipientUserId && card.recipientEmail && card.recipientEmail !== email) {
      throw new ForbiddenException('Este bono es para otra persona: inicia sesión con el correo al que lo enviaron.');
    }
  }

  // ─── Panel del negocio ───

  async list(tenantId: string) {
    const rows = await this.cards.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 2000 });
    return rows.map((c) => ({ ...this.publicView(c), purchaseOrderId: c.purchaseOrderId, purchaserName: c.purchaserName, recipientPhone: c.recipientPhone, claimed: !!c.recipientUserId, cancelReason: c.cancelReason, createdAt: c.createdAt }));
  }

  async history(tenantId: string, id: string) {
    const card = await this.cards.findOne({ where: { id, tenantId } });
    if (!card) throw new NotFoundException('Bono no encontrado');
    return this.movements.find({ where: { tenantId, giftCardId: id }, order: { createdAt: 'ASC' } });
  }

  /** El negocio anula un bono (ej. se reportó perdido). El saldo deja de poder usarse. */
  async cancel(tenantId: string, id: string, actorId: string, reason: string) {
    const why = (reason || '').trim();
    if (why.length < 5) throw new BadRequestException('Indica el motivo de la anulación (mínimo 5 caracteres).');
    return this.cards.manager.transaction(async (manager) => {
      const card = await manager.findOne(GiftCard, { where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!card) throw new NotFoundException('Bono no encontrado');
      if (card.status === 'ANULADO') throw new BadRequestException('El bono ya está anulado.');
      card.status = 'ANULADO';
      card.cancelReason = why.slice(0, 300);
      await manager.save(card);
      await this.log(manager, card, 'ANULACION', 0, null, card.cancelReason, actorId);
      return this.publicView(card);
    });
  }

  /** Bonos que compró un pedido (seguimiento: el código solo cuando está activo). */
  async forPurchaseOrder(orderId: string) {
    const rows = await this.cards.find({ where: { purchaseOrderId: orderId }, order: { createdAt: 'ASC' } });
    return rows.map((c) => {
      const v = this.publicView(c);
      // El WhatsApp de quien lo recibe lo escribió el mismo comprador (para compartirle el bono)
      return { ...v, code: c.status === 'PENDIENTE' ? null : v.code, recipientPhone: c.recipientPhone };
    });
  }

  publicView(c: GiftCard) {
    return {
      id: c.id,
      code: c.code,
      amount: Number(c.amount),
      balance: Number(c.balance),
      status: effectiveStatus(c),
      recipientName: c.recipientName,
      recipientEmail: c.recipientEmail,
      senderName: c.senderName,
      message: c.message,
      activatedAt: c.activatedAt,
      expiresAt: c.expiresAt,
    };
  }

  private async log(manager: EntityManager, card: GiftCard, type: GiftCardMovementType, amount: number, orderId: string | null, note: string | null, actorId: string | null = null) {
    await manager.save(manager.create(GiftCardMovement, {
      tenantId: card.tenantId,
      giftCardId: card.id,
      type,
      amount,
      balanceAfter: Number(card.balance),
      orderId,
      note: note?.slice(0, 300) || null,
      actorId,
    }));
  }
}

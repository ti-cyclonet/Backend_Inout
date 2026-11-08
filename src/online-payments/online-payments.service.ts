import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { TenantPaymentAccount } from './tenant-payment-account.entity';
import { MercadoPagoClient } from './mercadopago.client';
import {
  MercadoPagoConfig,
  commissionFor,
  decryptToken,
  encryptToken,
  isAvailable,
  orderReference,
  parseOrderReference,
  readMercadoPagoConfig,
  signState,
  verifyState,
  verifyWebhookSignature,
} from './mercadopago.config';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrderPaymentsService } from '../orders/order-payments.service';
import { balanceDue } from '../orders/payment-plans';

/** Mensaje para el negocio y el cliente mientras CycloNet termina la configuración. */
export const NOT_AVAILABLE_MESSAGE =
  'Los pagos en línea con Mercado Pago están en configuración y todavía no están disponibles. Te avisaremos cuando puedas usarlos.';

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo que el cliente paga en línea ahora: lo que falta del anticipo si el plan
 * lo exige y no está cubierto; si no, el saldo del pedido. 0 = nada que pagar
 * (a crédito, cancelado, facturado o ya pagado).
 */
export function amountToPayOnline(order: Pick<Order, 'status' | 'paymentPlan' | 'total' | 'amountPaid' | 'depositRequired'>): number {
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.INVOICED) return 0;
  if (order.paymentPlan === 'CREDITO') return 0;
  const due = balanceDue({ total: Number(order.total), amountPaid: Number(order.amountPaid) });
  const depositLeft = round2(Number(order.depositRequired || 0) - Number(order.amountPaid || 0));
  return Math.round(depositLeft >= 1 ? Math.min(depositLeft, due) : due);
}

/**
 * Pagos en línea de las tiendas de InOut con la cuenta de Mercado Pago de cada
 * negocio. Mientras CycloNet no tenga su cuenta (ver missingConfig), todo
 * responde "en configuración" y los negocios pueden pedir que se les avise.
 */
@Injectable()
export class OnlinePaymentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OnlinePaymentsService.name);
  private readonly authorizaUrl = (process.env.AUTHORIZA_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

  constructor(
    @InjectRepository(TenantPaymentAccount) private readonly accounts: Repository<TenantPaymentAccount>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mp: MercadoPagoClient,
    private readonly orderPayments: OrderPaymentsService,
  ) {}

  /** Se lee en cada uso: encender los pagos solo exige cambiar el .env y reiniciar. */
  config(): MercadoPagoConfig {
    return readMercadoPagoConfig();
  }

  available(): boolean {
    return isAvailable(this.config());
  }

  /** Al arrancar con los pagos ya disponibles, avisa a los negocios que lo pidieron. */
  onApplicationBootstrap(): void {
    if (!this.available()) return;
    setTimeout(() => this.notifyWaitingTenants().catch((e) => this.logger.warn(`Avisos de pagos en línea: ${e.message}`)), 30_000);
  }

  // ═══════════════════════ Negocio (panel de InOut)

  async status(tenantId: string) {
    const c = this.config();
    const acc = await this.accounts.findOne({ where: { tenantId } });
    const connected = acc?.status === 'CONNECTED';
    return {
      available: isAvailable(c),
      provider: 'MERCADOPAGO',
      message: isAvailable(c) ? null : NOT_AVAILABLE_MESSAGE,
      commissionPercent: c.commissionPercent,
      account: {
        status: acc?.status && acc.status !== 'NONE' ? acc.status : 'NOT_CONNECTED',
        connected,
        providerUserId: connected ? acc!.providerUserId : null,
        connectedAt: connected ? acc!.connectedAt : null,
        enabledForStore: connected ? acc!.enabledForStore : false,
        lastError: acc?.status === 'ERROR' ? acc.lastError : null,
      },
      notify: {
        requested: !!acc?.notifyRequestedAt,
        email: acc?.notifyEmail || null,
        requestedAt: acc?.notifyRequestedAt || null,
      },
    };
  }

  /** "Avísame cuando esté disponible". */
  async requestNotify(tenantId: string, email: string | null | undefined) {
    const to = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new BadRequestException('Escribe un correo válido para avisarte.');
    const acc = (await this.accounts.findOne({ where: { tenantId } })) || this.accounts.create({ tenantId, status: 'NONE' });
    acc.notifyEmail = to.slice(0, 255);
    acc.notifyRequestedAt = new Date();
    acc.notifiedAt = null;
    await this.accounts.save(acc);
    return this.status(tenantId);
  }

  /** URL de Mercado Pago para que el negocio autorice a InOut a cobrar en su nombre. */
  connectUrl(tenantId: string): { url: string } {
    const c = this.assertAvailable();
    const q = new URLSearchParams({
      client_id: c.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state: signState(tenantId, c.tokensKey),
      redirect_uri: c.redirectUri,
    });
    return { url: `${c.authUrl}?${q.toString()}` };
  }

  /** Vuelta de Mercado Pago: guarda los tokens (cifrados) y devuelve a dónde redirigir. */
  async handleOAuthCallback(query: { code?: string; state?: string; error?: string }, actor?: string): Promise<string> {
    const c = this.config();
    const back = (result: string) => `${c.appUrl}/marketplace?admin=true&mp=${result}`;
    if (!isAvailable(c)) return back('unavailable');
    const tenantId = verifyState(String(query.state || ''), c.tokensKey);
    if (!tenantId) return back('expired');
    if (query.error || !query.code) return back('cancelled');
    try {
      const t = await this.mp.oauthToken(c, { code: String(query.code) });
      const acc = (await this.accounts.findOne({ where: { tenantId } })) || this.accounts.create({ tenantId });
      Object.assign(acc, {
        provider: 'MERCADOPAGO',
        status: 'CONNECTED',
        providerUserId: t.user_id != null ? String(t.user_id) : null,
        accessTokenEnc: encryptToken(t.access_token, c.tokensKey),
        refreshTokenEnc: t.refresh_token ? encryptToken(t.refresh_token, c.tokensKey) : null,
        publicKey: t.public_key || null,
        tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
        connectedAt: new Date(),
        connectedBy: actor || null,
        enabledForStore: true,
        lastError: null,
      });
      await this.accounts.save(acc);
      return back('connected');
    } catch (e) {
      this.logger.warn(`No se pudo conectar Mercado Pago (${tenantId}): ${(e as Error).message}`);
      return back('error');
    }
  }

  async disconnect(tenantId: string) {
    const acc = await this.accounts.findOne({ where: { tenantId } });
    if (acc) {
      Object.assign(acc, { status: 'DISCONNECTED', accessTokenEnc: null, refreshTokenEnc: null, publicKey: null, tokenExpiresAt: null, enabledForStore: false });
      await this.accounts.save(acc);
    }
    return this.status(tenantId);
  }

  async setEnabledForStore(tenantId: string, enabled: boolean) {
    const acc = await this.accounts.findOne({ where: { tenantId } });
    if (!acc || acc.status !== 'CONNECTED') throw new BadRequestException('Primero conecta tu cuenta de Mercado Pago.');
    acc.enabledForStore = !!enabled;
    await this.accounts.save(acc);
    return this.status(tenantId);
  }

  // ═══════════════════════ Tienda (público)

  /** ¿La tienda cobra en línea? (para el checkout) */
  async storeStatus(tenantId: string) {
    const available = this.available();
    const acc = available ? await this.accounts.findOne({ where: { tenantId } }) : null;
    return {
      available: available && acc?.status === 'CONNECTED' && acc.enabledForStore,
      inConfiguration: !available,
      message: available ? null : NOT_AVAILABLE_MESSAGE,
    };
  }

  /** Para el seguimiento del pedido: si se puede pagar en línea y cuánto. */
  async orderStatus(trackingToken: string) {
    const order = await this.findOrder(trackingToken);
    const store = await this.storeStatus(order.tenantId);
    const amount = amountToPayOnline(order);
    return { ...store, available: store.available && amount > 0, amount };
  }

  /** Crea el pago en Mercado Pago (Checkout Pro) y devuelve la URL a la que va el cliente. */
  async createOrderCheckout(trackingToken: string): Promise<{ url: string; amount: number }> {
    const c = this.assertAvailable();
    const order = await this.findOrder(trackingToken);
    const acc = await this.accounts.findOne({ where: { tenantId: order.tenantId } });
    if (!acc || acc.status !== 'CONNECTED' || !acc.enabledForStore) {
      throw new BadRequestException('Esta tienda no recibe pagos en línea.');
    }
    const amount = amountToPayOnline(order);
    if (amount <= 0) throw new BadRequestException('Este pedido no tiene pagos pendientes en línea.');

    const accessToken = await this.accessToken(acc, c);
    // Mismo enlace de seguimiento que recibe el cliente (marketplace/:tienda/pedido/:token)
    const trackUrl = `${c.appUrl}/marketplace/${encodeURIComponent(order.tenantId)}/pedido/${trackingToken}`;
    const pref = await this.mp.createPreference(c, accessToken, {
      items: [{ id: order.id, title: `Pedido ${order.orderCode || ''}`.trim(), quantity: 1, unit_price: amount, currency_id: 'COP' }],
      external_reference: orderReference(order.tenantId, order.id),
      marketplace_fee: commissionFor(amount, c.commissionPercent),
      notification_url: `${c.publicApiUrl}/online-payments/mercadopago/webhook?t=${encodeURIComponent(order.tenantId)}`,
      back_urls: { success: `${trackUrl}?pago=ok`, pending: `${trackUrl}?pago=pendiente`, failure: `${trackUrl}?pago=error` },
      auto_return: 'approved',
      statement_descriptor: 'CYCLONET INOUT',
    }, `${order.id}:${Math.round(Number(order.amountPaid) || 0)}:${amount}`);
    return { url: pref.init_point, amount };
  }

  // ═══════════════════════ Notificaciones de Mercado Pago (webhook)

  async handleWebhook(input: {
    tenantId?: string;
    signature?: string;
    requestId?: string;
    query: Record<string, any>;
    body: any;
  }): Promise<{ ok: boolean; result: string }> {
    const c = this.config();
    if (!isAvailable(c)) return { ok: true, result: 'unavailable' };
    const type = input.body?.type || input.query?.type || input.query?.topic;
    const paymentId = String(input.body?.data?.id ?? input.query?.['data.id'] ?? input.query?.id ?? '');
    if (!verifyWebhookSignature({ signature: input.signature, requestId: input.requestId, dataId: input.query?.['data.id'] ?? paymentId }, c.webhookSecret)) {
      throw new UnauthorizedException('Firma no válida');
    }
    if (type !== 'payment' || !paymentId || !input.tenantId) return { ok: true, result: 'ignored' };

    const acc = await this.accounts.findOne({ where: { tenantId: input.tenantId } });
    if (!acc?.accessTokenEnc) return { ok: true, result: 'no-account' };
    const payment = await this.mp.getPayment(c, await this.accessToken(acc, c), paymentId);
    const ref = parseOrderReference(payment.external_reference);
    if (!ref || ref.tenantId !== input.tenantId) return { ok: true, result: 'not-ours' };
    if (payment.status !== 'approved') return { ok: true, result: `status:${payment.status}` };

    const r = await this.orderPayments.registerOnlinePayment({
      tenantId: ref.tenantId,
      orderId: ref.orderId,
      amount: Number(payment.transaction_amount),
      providerReference: `MP-${payment.id}`,
      notes: 'Pago en línea con Mercado Pago',
    });
    return { ok: true, result: r.duplicated ? 'duplicated' : 'registered' };
  }

  // ═══════════════════════ Aviso de disponibilidad

  /** Envía el correo a los negocios que pidieron aviso (una sola vez cada uno). */
  async notifyWaitingTenants(): Promise<{ sent: number; failed: number }> {
    if (!this.available()) return { sent: 0, failed: 0 };
    const waiting = await this.accounts.find({ where: { notifyRequestedAt: Not(IsNull()), notifiedAt: IsNull() } });
    let sent = 0;
    let failed = 0;
    for (const acc of waiting) {
      if (!acc.notifyEmail) continue;
      try {
        const res = await fetch(`${this.authorizaUrl}/api/notifications/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
          body: JSON.stringify({
            to: acc.notifyEmail,
            templateCode: 'INOUT_ONLINE_PAYMENTS_AVAILABLE',
            variables: { settingsUrl: `${this.config().appUrl}/marketplace?admin=true`, year: String(new Date().getFullYear()) },
            tenantId: acc.tenantId,
          }),
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) throw new Error(body?.message || `HTTP ${res.status}`);
        acc.notifiedAt = new Date();
        await this.accounts.save(acc);
        sent++;
      } catch (e) {
        failed++;
        this.logger.warn(`No se pudo avisar a ${acc.tenantId} de los pagos en línea: ${(e as Error).message}`);
      }
    }
    if (sent || failed) this.logger.log(`Pagos en línea disponibles: ${sent} aviso(s) enviado(s), ${failed} fallido(s)`);
    return { sent, failed };
  }

  // ═══════════════════════ Internos

  private assertAvailable(): MercadoPagoConfig {
    const c = this.config();
    if (!isAvailable(c)) {
      throw new ServiceUnavailableException({ error: 'ONLINE_PAYMENTS_NOT_AVAILABLE', message: NOT_AVAILABLE_MESSAGE });
    }
    return c;
  }

  private async findOrder(trackingToken: string): Promise<Order> {
    if (!trackingToken || trackingToken.length < 20) throw new NotFoundException('Pedido no encontrado');
    const order = await this.dataSource.getRepository(Order).findOne({ where: { trackingToken } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  /** Token del negocio; si vence en menos de un día se renueva con el refresh_token. */
  private async accessToken(acc: TenantPaymentAccount, c: MercadoPagoConfig): Promise<string> {
    const expiresSoon = acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() - Date.now() < DAY_MS;
    if (expiresSoon && acc.refreshTokenEnc) {
      try {
        const t = await this.mp.oauthToken(c, { refreshToken: decryptToken(acc.refreshTokenEnc, c.tokensKey) });
        acc.accessTokenEnc = encryptToken(t.access_token, c.tokensKey);
        if (t.refresh_token) acc.refreshTokenEnc = encryptToken(t.refresh_token, c.tokensKey);
        acc.tokenExpiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null;
        acc.lastError = null;
        await this.accounts.save(acc);
      } catch (e) {
        acc.status = 'ERROR';
        acc.lastError = `No se pudo renovar el acceso: ${(e as Error).message}`.slice(0, 255);
        await this.accounts.save(acc);
        throw new BadRequestException('La cuenta de Mercado Pago de la tienda necesita conectarse de nuevo.');
      }
    }
    if (!acc.accessTokenEnc) throw new BadRequestException('La tienda no tiene su cuenta de Mercado Pago conectada.');
    return decryptToken(acc.accessTokenEnc, c.tokensKey);
  }
}

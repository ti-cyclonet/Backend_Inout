import { createHmac } from 'crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import {
  commissionFor,
  decryptToken,
  encryptToken,
  missingConfig,
  orderReference,
  parseOrderReference,
  readMercadoPagoConfig,
  signState,
  verifyState,
  verifyWebhookSignature,
} from './mercadopago.config';
import { NOT_AVAILABLE_MESSAGE, OnlinePaymentsService, amountToPayOnline } from './online-payments.service';
import { OrderStatus } from '../orders/entities/order.entity';

const KEY = 'k'.repeat(40);
const ENV_ON = {
  MERCADOPAGO_ENABLED: 'true',
  MERCADOPAGO_CLIENT_ID: 'app-123',
  MERCADOPAGO_CLIENT_SECRET: 'secreto',
  MERCADOPAGO_WEBHOOK_SECRET: 'whsec',
  INOUT_PUBLIC_API_URL: 'https://api.cyclonet.com.co/api/inventory/',
  INOUT_APP_URL: 'https://app.cyclonet.com.co',
  PAYMENT_TOKENS_KEY: KEY,
};

describe('Pagos en línea · configuración', () => {
  it('sin la cuenta de CycloNet queda en configuración (apagado)', () => {
    expect(missingConfig(readMercadoPagoConfig({}))).toContain('MERCADOPAGO_ENABLED');
    expect(missingConfig(readMercadoPagoConfig({ ...ENV_ON, MERCADOPAGO_ENABLED: 'false' }))).toEqual(['MERCADOPAGO_ENABLED']);
    expect(missingConfig(readMercadoPagoConfig({ ...ENV_ON, PAYMENT_TOKENS_KEY: 'corta' }))).toEqual(['PAYMENT_TOKENS_KEY']);
  });

  it('con todo configurado está disponible y arma el callback desde la URL pública', () => {
    const c = readMercadoPagoConfig(ENV_ON);
    expect(missingConfig(c)).toEqual([]);
    expect(c.redirectUri).toBe('https://api.cyclonet.com.co/api/inventory/online-payments/mercadopago/callback');
    expect(c.commissionPercent).toBe(1);
  });

  it('comisión de CycloNet del 1 % en pesos enteros', () => {
    expect(commissionFor(45_900, 1)).toBe(459);
    expect(commissionFor(1_250, 1)).toBe(13);
    expect(commissionFor(0, 1)).toBe(0);
  });

  it('los tokens del negocio se guardan cifrados y solo se leen con la clave', () => {
    const sealed = encryptToken('APP_USR-token-del-negocio', KEY);
    expect(sealed).not.toContain('APP_USR');
    expect(decryptToken(sealed, KEY)).toBe('APP_USR-token-del-negocio');
    expect(() => decryptToken(sealed, 'otra-clave-'.repeat(4))).toThrow();
  });

  it('el state de OAuth lleva el negocio, no se puede alterar y vence', () => {
    const now = Date.now();
    const state = signState('tenant-1', KEY, now);
    expect(verifyState(state, KEY, now + 60_000)).toBe('tenant-1');
    expect(verifyState(state, KEY, now + 16 * 60_000)).toBeNull();
    expect(verifyState(state.replace(/^./, 'x'), KEY, now)).toBeNull();
    expect(verifyState(state, 'otra-clave-'.repeat(4), now)).toBeNull();
  });

  it('valida la firma x-signature de las notificaciones', () => {
    const v1 = createHmac('sha256', 'whsec').update('id:123456;request-id:req-1;ts:1700000000;').digest('hex');
    expect(verifyWebhookSignature({ signature: `ts=1700000000,v1=${v1}`, requestId: 'req-1', dataId: '123456' }, 'whsec')).toBe(true);
    expect(verifyWebhookSignature({ signature: `ts=1700000000,v1=${v1}`, requestId: 'req-1', dataId: '999' }, 'whsec')).toBe(false);
    expect(verifyWebhookSignature({ signature: '', dataId: '123456' }, 'whsec')).toBe(false);
  });

  it('external_reference: negocio y pedido', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(parseOrderReference(orderReference('t1', id))).toEqual({ tenantId: 't1', orderId: id });
    expect(parseOrderReference('otra-cosa')).toBeNull();
  });

  it('monto a pagar: lo que falta del anticipo, o el saldo; nada a crédito ni cancelado', () => {
    const o = (x: any) => ({ status: OrderStatus.CONFIRMED, paymentPlan: 'CONTADO', total: 100_000, amountPaid: 0, depositRequired: 0, ...x });
    expect(amountToPayOnline(o({}))).toBe(100_000);
    expect(amountToPayOnline(o({ paymentPlan: 'MITAD_MITAD', depositRequired: 50_000 }))).toBe(50_000);
    expect(amountToPayOnline(o({ paymentPlan: 'MITAD_MITAD', depositRequired: 50_000, amountPaid: 50_000 }))).toBe(50_000);
    expect(amountToPayOnline(o({ amountPaid: 100_000 }))).toBe(0);
    expect(amountToPayOnline(o({ paymentPlan: 'CREDITO' }))).toBe(0);
    expect(amountToPayOnline(o({ status: OrderStatus.CANCELLED }))).toBe(0);
  });
});

describe('Pagos en línea · servicio', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  const make = (account: any = null, order: any = null) => {
    const accounts = {
      findOne: jest.fn(async () => account),
      find: jest.fn(async () => []),
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn(async (x: any) => x),
    };
    const dataSource = { getRepository: () => ({ findOne: jest.fn(async () => order) }) };
    const mp = {
      oauthToken: jest.fn(async () => ({ access_token: 'APP_USR-1', refresh_token: 'TG-1', user_id: 777, public_key: 'APP_USR-pk', expires_in: 15_552_000 })),
      createPreference: jest.fn(async () => ({ id: 'pref-1', init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-1' })),
      getPayment: jest.fn(),
    };
    const orderPayments = { registerOnlinePayment: jest.fn(async () => ({ duplicated: false })) };
    const service = new OnlinePaymentsService(accounts as any, dataSource as any, mp as any, orderPayments as any);
    return { service, accounts, mp, orderPayments };
  };

  it('en configuración: el estado lo dice y conectar responde "no disponible"', async () => {
    process.env.MERCADOPAGO_ENABLED = 'false';
    const { service } = make();
    const s = await service.status('t1');
    expect(s.available).toBe(false);
    expect(s.message).toBe(NOT_AVAILABLE_MESSAGE);
    expect(s.account.status).toBe('NOT_CONNECTED');
    expect(() => service.connectUrl('t1')).toThrow(ServiceUnavailableException);
    expect((await service.storeStatus('t1')).available).toBe(false);
  });

  it('"Avísame" guarda el correo para cuando esté disponible', async () => {
    process.env.MERCADOPAGO_ENABLED = 'false';
    const { service, accounts } = make();
    await service.requestNotify('t1', 'Dueno@Tienda.co');
    expect(accounts.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', notifyEmail: 'dueno@tienda.co', notifiedAt: null }));
    await expect(service.requestNotify('t1', 'no-es-correo')).rejects.toThrow('correo válido');
  });

  it('disponible: conecta la cuenta del negocio con tokens cifrados', async () => {
    Object.assign(process.env, ENV_ON);
    const { service, accounts } = make();
    const { url } = service.connectUrl('t1');
    expect(url).toContain('client_id=app-123');
    const state = new URL(url).searchParams.get('state')!;
    const back = await service.handleOAuthCallback({ code: 'TG-code', state });
    expect(back).toBe('https://app.cyclonet.com.co/marketplace?admin=true&mp=connected');
    const acc = accounts.save.mock.calls[0][0];
    expect(acc).toEqual(expect.objectContaining({ tenantId: 't1', status: 'CONNECTED', providerUserId: '777', enabledForStore: true }));
    expect(acc.accessTokenEnc).not.toContain('APP_USR-1');
    expect(decryptToken(acc.accessTokenEnc, KEY)).toBe('APP_USR-1');
  });

  it('cobra el pedido con el token del negocio y la comisión de CycloNet', async () => {
    Object.assign(process.env, ENV_ON);
    const order = { id: '11111111-2222-3333-4444-555555555555', tenantId: 't1', orderCode: 'SC-PD-00012', status: OrderStatus.CONFIRMED, paymentPlan: 'CONTADO', total: 45_900, amountPaid: 0, depositRequired: 0 };
    const account = { tenantId: 't1', status: 'CONNECTED', enabledForStore: true, accessTokenEnc: encryptToken('APP_USR-1', KEY), tokenExpiresAt: new Date(Date.now() + 90 * 86_400_000) };
    const { service, mp } = make(account, order);
    const r = await service.createOrderCheckout('x'.repeat(32));
    expect(r.amount).toBe(45_900);
    const [, token, pref] = mp.createPreference.mock.calls[0] as any[];
    expect(token).toBe('APP_USR-1');
    expect(pref).toEqual(expect.objectContaining({ marketplace_fee: 459, external_reference: `inout:t1:${order.id}` }));
    expect(pref.notification_url).toBe('https://api.cyclonet.com.co/api/inventory/online-payments/mercadopago/webhook?t=t1');
  });

  it('la notificación firmada de un pago aprobado lo registra verificado en el pedido', async () => {
    Object.assign(process.env, ENV_ON);
    const account = { tenantId: 't1', status: 'CONNECTED', accessTokenEnc: encryptToken('APP_USR-1', KEY), tokenExpiresAt: null };
    const { service, mp, orderPayments } = make(account);
    const orderId = '11111111-2222-3333-4444-555555555555';
    mp.getPayment.mockResolvedValue({ id: 987, status: 'approved', transaction_amount: 45_900, external_reference: `inout:t1:${orderId}` });
    const v1 = createHmac('sha256', 'whsec').update('id:987;request-id:r1;ts:1;').digest('hex');
    const r = await service.handleWebhook({ tenantId: 't1', signature: `ts=1,v1=${v1}`, requestId: 'r1', query: { 'data.id': '987', type: 'payment' }, body: { type: 'payment', data: { id: '987' } } });
    expect(r.result).toBe('registered');
    expect(orderPayments.registerOnlinePayment).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', orderId, amount: 45_900, providerReference: 'MP-987' }));
    await expect(service.handleWebhook({ tenantId: 't1', signature: 'ts=1,v1=malo', requestId: 'r1', query: { 'data.id': '987' }, body: { type: 'payment', data: { id: '987' } } }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});

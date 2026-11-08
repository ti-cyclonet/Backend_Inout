import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Pagos en línea con Mercado Pago: cada negocio conecta SU cuenta (OAuth) y el
 * dinero de sus ventas le llega directo; CycloNet cobra su comisión con
 * marketplace_fee. Todo queda apagado hasta que CycloNet tenga su cuenta de
 * Mercado Pago (MERCADOPAGO_ENABLED=true y las credenciales de la aplicación).
 * Funciones puras (mercadopago.config.spec.ts).
 */
export interface MercadoPagoConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  /** Callback de OAuth en este backend (debe estar registrado en la aplicación de Mercado Pago). */
  redirectUri: string;
  /** Clave secreta de las notificaciones (webhooks) de la aplicación. */
  webhookSecret: string;
  /** URL pública de esta API tal como la ve internet (p. ej. https://…/api/inventory): para notification_url y el callback. */
  publicApiUrl: string;
  /** URL de InOut (frontend), para volver después de conectar o de pagar. */
  appUrl: string;
  /** Comisión de CycloNet por pago aprobado, en %. */
  commissionPercent: number;
  /** Clave para cifrar los tokens de cada negocio en la base de datos. */
  tokensKey: string;
  apiUrl: string;
  authUrl: string;
}

export function readMercadoPagoConfig(env: NodeJS.ProcessEnv = process.env): MercadoPagoConfig {
  const strip = (v?: string) => (v || '').trim().replace(/\/+$/, '');
  const pct = Number(env.ONLINE_PAYMENTS_COMMISSION_PERCENT);
  const publicApiUrl = strip(env.INOUT_PUBLIC_API_URL);
  return {
    enabled: String(env.MERCADOPAGO_ENABLED || '').toLowerCase() === 'true',
    clientId: (env.MERCADOPAGO_CLIENT_ID || '').trim(),
    clientSecret: (env.MERCADOPAGO_CLIENT_SECRET || '').trim(),
    redirectUri: strip(env.MERCADOPAGO_REDIRECT_URI) || (publicApiUrl ? `${publicApiUrl}/online-payments/mercadopago/callback` : ''),
    webhookSecret: (env.MERCADOPAGO_WEBHOOK_SECRET || '').trim(),
    publicApiUrl,
    appUrl: strip(env.INOUT_APP_URL) || 'https://app.cyclonet.com.co',
    commissionPercent: Number.isFinite(pct) && pct >= 0 && pct <= 20 ? pct : 1,
    tokensKey: (env.PAYMENT_TOKENS_KEY || '').trim(),
    apiUrl: strip(env.MERCADOPAGO_API_URL) || 'https://api.mercadopago.com',
    authUrl: strip(env.MERCADOPAGO_AUTH_URL) || 'https://auth.mercadopago.com/authorization',
  };
}

/** Lo que falta para encender los pagos en línea (vacío = disponible). */
export function missingConfig(c: MercadoPagoConfig): string[] {
  const missing: string[] = [];
  if (!c.enabled) missing.push('MERCADOPAGO_ENABLED');
  if (!c.clientId) missing.push('MERCADOPAGO_CLIENT_ID');
  if (!c.clientSecret) missing.push('MERCADOPAGO_CLIENT_SECRET');
  if (!c.redirectUri) missing.push('MERCADOPAGO_REDIRECT_URI');
  if (!c.webhookSecret) missing.push('MERCADOPAGO_WEBHOOK_SECRET');
  if (!c.publicApiUrl) missing.push('INOUT_PUBLIC_API_URL');
  if (c.tokensKey.length < 32) missing.push('PAYMENT_TOKENS_KEY');
  return missing;
}

export const isAvailable = (c: MercadoPagoConfig) => missingConfig(c).length === 0;

/** Comisión de CycloNet (marketplace_fee) en pesos enteros. */
export function commissionFor(amount: number, percent: number): number {
  return Math.max(0, Math.round((Number(amount) || 0) * (percent / 100)));
}

// ── Tokens de cada negocio: cifrados (AES-256-GCM) en la base de datos ──

const keyOf = (secret: string) => createHash('sha256').update(secret).digest();

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptToken(sealed: string, secret: string): string {
  const [v, iv, tag, data] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Token cifrado no válido');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ── state de OAuth: firmado, con el negocio y una caducidad de 15 minutos ──

const b64url = (b: Buffer) => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function signState(tenantId: string, secret: string, now = Date.now()): string {
  const body = b64url(Buffer.from(JSON.stringify({ t: tenantId, e: now + 15 * 60_000, n: b64url(randomBytes(8)) })));
  return `${body}.${b64url(createHmac('sha256', secret).update(body).digest())}`;
}

/** El negocio del state, o null si fue alterado o ya venció. */
export function verifyState(state: string, secret: string, now = Date.now()): string | null {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = b64url(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof data?.t === 'string' && Number(data?.e) > now ? data.t : null;
  } catch {
    return null;
  }
}

/**
 * Firma de las notificaciones de Mercado Pago (cabecera x-signature:
 * "ts=…,v1=…"): HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
export function verifyWebhookSignature(
  input: { signature?: string; requestId?: string; dataId?: string },
  secret: string,
): boolean {
  const parts = Object.fromEntries(
    String(input.signature || '').split(',').map((p) => p.trim().split('=').map((s) => s.trim()) as [string, string]),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1 || !secret) return false;
  let manifest = '';
  if (input.dataId) manifest += `id:${String(input.dataId).toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** external_reference de los pagos de pedidos: "inout:<tenantId>:<orderId>". */
export const orderReference = (tenantId: string, orderId: string) => `inout:${tenantId}:${orderId}`;

export function parseOrderReference(ref: string | null | undefined): { tenantId: string; orderId: string } | null {
  const m = /^inout:([^:]+):([0-9a-f-]{36})$/i.exec(String(ref || ''));
  return m ? { tenantId: m[1], orderId: m[2] } : null;
}

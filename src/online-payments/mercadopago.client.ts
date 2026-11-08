import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig } from './mercadopago.config';

export interface MpTokens {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number | string;
  expires_in?: number;
}

export interface MpPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  currency_id?: string;
  external_reference?: string | null;
  date_approved?: string | null;
}

/** Llamadas HTTP a la API de Mercado Pago (aparte, para poder simularlas en las pruebas). */
@Injectable()
export class MercadoPagoClient {
  private async call<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.message || body?.error || `HTTP ${res.status}`;
      throw Object.assign(new Error(`Mercado Pago: ${msg}`), { status: res.status });
    }
    return body as T;
  }

  /** OAuth: cambia el code (o el refresh_token) por los tokens de la cuenta del negocio. */
  oauthToken(c: MercadoPagoConfig, grant: { code: string } | { refreshToken: string }): Promise<MpTokens> {
    const body = 'code' in grant
      ? { grant_type: 'authorization_code', code: grant.code, redirect_uri: c.redirectUri }
      : { grant_type: 'refresh_token', refresh_token: grant.refreshToken };
    return this.call<MpTokens>(`${c.apiUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, ...body }),
    });
  }

  /** Preferencia de pago (Checkout Pro) con el token del negocio y la comisión de CycloNet. */
  createPreference(c: MercadoPagoConfig, accessToken: string, preference: Record<string, unknown>, idempotencyKey: string) {
    return this.call<{ id: string; init_point: string }>(`${c.apiUrl}/checkout/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(preference),
    });
  }

  getPayment(c: MercadoPagoConfig, accessToken: string, paymentId: string): Promise<MpPayment> {
    return this.call<MpPayment>(`${c.apiUrl}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}

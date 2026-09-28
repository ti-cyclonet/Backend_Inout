import { BadRequestException } from '@nestjs/common';

/**
 * Formas de pago del MarketPlace. Funciones puras (sin BD) para poder probar
 * las reglas de montos, plazos y estados de pago de forma aislada.
 */

export const PAYMENT_PLANS = ['CONTADO', 'CONTRA_ENTREGA', 'MITAD_MITAD', 'PLAN_SEPARE', 'CREDITO'] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

/** Planes que exigen una cuenta de cliente (compromisos de semanas / cupo). */
export const PLANS_REQUIRING_ACCOUNT: PaymentPlan[] = ['PLAN_SEPARE', 'CREDITO'];

/** Planes que exigen un anticipo verificado antes de fabricar o despachar. */
export const PLANS_WITH_DEPOSIT: PaymentPlan[] = ['CONTADO', 'MITAD_MITAD', 'PLAN_SEPARE'];

export type PaymentStatus = 'SIN_PAGO' | 'ANTICIPO_PENDIENTE' | 'ANTICIPO_CUBIERTO' | 'PARCIAL' | 'PAGADO';

export interface PaymentOptions {
  contado: { enabled: boolean };
  contraEntrega: { enabled: boolean; maxOrderTotal?: number | null };
  mitadMitad: { enabled: boolean; depositPercent: number };
  planSepare: { enabled: boolean; minInitialPercent: number; maxDays: number; minOrderTotal?: number | null };
  credito: { enabled: boolean };
  /** Horas para recibir el anticipo antes de cancelar el pedido y liberar el stock. */
  depositTimeoutHours: number;
  /** Si el pedido incluye productos por fabricar, no se acepta contra entrega. */
  madeToOrderRequiresDeposit: boolean;
  /** Datos de pago que ve el cliente (cuentas, Nequi…). */
  instructions: string;
}

/**
 * Configuración por defecto. Reproduce el comportamiento anterior a esta
 * funcionalidad: contado implícito y crédito para clientes con cupo.
 */
export const DEFAULT_PAYMENT_OPTIONS: PaymentOptions = {
  contado: { enabled: true },
  contraEntrega: { enabled: false, maxOrderTotal: null },
  mitadMitad: { enabled: false, depositPercent: 50 },
  planSepare: { enabled: false, minInitialPercent: 20, maxDays: 60, minOrderTotal: null },
  credito: { enabled: true },
  depositTimeoutHours: 24,
  madeToOrderRequiresDeposit: true,
  instructions: '',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Mezcla lo guardado con los valores por defecto y normaliza rangos. */
export function resolvePaymentOptions(saved?: Partial<PaymentOptions> | null): PaymentOptions {
  const s: any = saved || {};
  const d = DEFAULT_PAYMENT_OPTIONS;
  const num = (v: any, fallback: number) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
  const optNum = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
  return {
    contado: { enabled: s.contado?.enabled ?? d.contado.enabled },
    contraEntrega: { enabled: s.contraEntrega?.enabled ?? d.contraEntrega.enabled, maxOrderTotal: optNum(s.contraEntrega?.maxOrderTotal) },
    mitadMitad: {
      enabled: s.mitadMitad?.enabled ?? d.mitadMitad.enabled,
      depositPercent: clamp(num(s.mitadMitad?.depositPercent, d.mitadMitad.depositPercent), 1, 99),
    },
    planSepare: {
      enabled: s.planSepare?.enabled ?? d.planSepare.enabled,
      minInitialPercent: clamp(num(s.planSepare?.minInitialPercent, d.planSepare.minInitialPercent), 1, 99),
      maxDays: clamp(Math.round(num(s.planSepare?.maxDays, d.planSepare.maxDays)), 1, 365),
      minOrderTotal: optNum(s.planSepare?.minOrderTotal),
    },
    credito: { enabled: s.credito?.enabled ?? d.credito.enabled },
    depositTimeoutHours: clamp(Math.round(num(s.depositTimeoutHours, d.depositTimeoutHours)), 1, 24 * 30),
    madeToOrderRequiresDeposit: s.madeToOrderRequiresDeposit ?? d.madeToOrderRequiresDeposit,
    instructions: String(s.instructions ?? d.instructions).slice(0, 1000),
  };
}

export function isPlanEnabled(options: PaymentOptions, plan: PaymentPlan): boolean {
  switch (plan) {
    case 'CONTADO': return options.contado.enabled;
    case 'CONTRA_ENTREGA': return options.contraEntrega.enabled;
    case 'MITAD_MITAD': return options.mitadMitad.enabled;
    case 'PLAN_SEPARE': return options.planSepare.enabled;
    case 'CREDITO': return options.credito.enabled;
  }
}

export interface PlanTerms {
  /** Monto que debe estar verificado antes de fabricar o despachar. */
  depositRequired: number;
  /** Límite para recibir el anticipo (null si el plan no lo exige). */
  depositDeadline: Date | null;
  /** Límite para completar el plan separe (YYYY-MM-DD, null si no aplica). */
  layawayDeadline: string | null;
}

/**
 * Valida que el plan se pueda usar para este pedido y calcula sus condiciones.
 * Los montos y plazos salen SIEMPRE de aquí (servidor), nunca del cliente.
 */
export function computePlanTerms(
  plan: PaymentPlan,
  options: PaymentOptions,
  ctx: { total: number; hasAccount: boolean; hasMadeToOrder: boolean; now?: Date },
): PlanTerms {
  const now = ctx.now || new Date();
  const total = round2(Math.max(0, Number(ctx.total) || 0));

  if (!PAYMENT_PLANS.includes(plan)) {
    throw new BadRequestException('Forma de pago no válida.');
  }
  if (!isPlanEnabled(options, plan)) {
    throw new BadRequestException('Esta tienda no ofrece esa forma de pago.');
  }
  if (PLANS_REQUIRING_ACCOUNT.includes(plan) && !ctx.hasAccount) {
    throw new BadRequestException('Inicia sesión o crea tu cuenta para pagar con esta opción.');
  }
  if (plan === 'CONTRA_ENTREGA') {
    if (ctx.hasMadeToOrder && options.madeToOrderRequiresDeposit) {
      throw new BadRequestException('Los productos por fabricar requieren un anticipo: elige otra forma de pago.');
    }
    const max = options.contraEntrega.maxOrderTotal;
    if (max && total > max) {
      throw new BadRequestException(`El pago contra entrega está disponible para pedidos de hasta $${max.toLocaleString('es-CO')}.`);
    }
  }
  if (plan === 'PLAN_SEPARE') {
    const min = options.planSepare.minOrderTotal;
    if (min && total < min) {
      throw new BadRequestException(`El plan separe está disponible para pedidos desde $${min.toLocaleString('es-CO')}.`);
    }
  }

  let depositRequired = 0;
  if (plan === 'CONTADO') depositRequired = total;
  if (plan === 'MITAD_MITAD') depositRequired = round2((total * options.mitadMitad.depositPercent) / 100);
  if (plan === 'PLAN_SEPARE') depositRequired = round2((total * options.planSepare.minInitialPercent) / 100);

  const depositDeadline = depositRequired > 0
    ? new Date(now.getTime() + options.depositTimeoutHours * 3600 * 1000)
    : null;

  let layawayDeadline: string | null = null;
  if (plan === 'PLAN_SEPARE') {
    const d = new Date(now.getTime() + options.planSepare.maxDays * 24 * 3600 * 1000);
    layawayDeadline = toBogotaDate(d);
  }

  return { depositRequired, depositDeadline, layawayDeadline };
}

/** Estado de pago a partir de lo verificado. */
export function computePaymentStatus(order: { total: number; depositRequired: number; amountPaid: number }): PaymentStatus {
  const total = round2(Number(order.total) || 0);
  const paid = round2(Number(order.amountPaid) || 0);
  const deposit = round2(Number(order.depositRequired) || 0);
  if (total > 0 && paid >= total) return 'PAGADO';
  if (deposit > 0) {
    if (paid <= 0) return 'ANTICIPO_PENDIENTE';
    return paid >= deposit ? 'ANTICIPO_CUBIERTO' : 'PARCIAL';
  }
  return paid > 0 ? 'PARCIAL' : 'SIN_PAGO';
}

/** ¿El anticipo exigido ya está cubierto? (siempre true si el plan no exige anticipo) */
export function isDepositCovered(order: { depositRequired: number; amountPaid: number }): boolean {
  return round2(Number(order.amountPaid) || 0) >= round2(Number(order.depositRequired) || 0);
}

export function balanceDue(order: { total: number; amountPaid: number }): number {
  return Math.max(0, round2((Number(order.total) || 0) - (Number(order.amountPaid) || 0)));
}

/** Fecha calendario en Colombia (YYYY-MM-DD). */
export function toBogotaDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

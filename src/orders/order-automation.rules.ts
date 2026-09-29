import { OrderStatus } from './entities/order.entity';
import { balanceDue, isDepositCovered, PaymentPlan, PLANS_WITH_DEPOSIT } from './payment-plans';

/**
 * Reglas de las tareas automáticas de pedidos (funciones puras, probadas en
 * order-automation.rules.spec.ts). Fechas "YYYY-MM-DD" en hora de Colombia.
 */

export interface AutomationOrder {
  status: OrderStatus | string;
  paymentPlan: string | null;
  total: number | string;
  amountPaid: number | string;
  depositRequired: number | string;
  depositDeadline: Date | string | null;
  layawayDeadline: string | null;
}

const CLOSED = [OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.INVOICED] as string[];

/** Días antes del vencimiento del plan separe en que se recuerda al cliente. */
export const LAYAWAY_REMINDER_DAYS = [7, 3, 1];

/**
 * El anticipo venció sin verificarse: se cancela para liberar el stock. Solo
 * pedidos aún en espera (CONFIRMED); si el cliente ya subió un comprobante que
 * el negocio no ha revisado, NO se cancela (no es culpa del cliente).
 */
export function isDepositExpired(order: AutomationOrder, now: Date, hasPendingVoucher: boolean): boolean {
  if (order.status !== OrderStatus.CONFIRMED) return false;
  if (!order.paymentPlan || !PLANS_WITH_DEPOSIT.includes(order.paymentPlan as PaymentPlan)) return false;
  if (!order.depositDeadline || new Date(order.depositDeadline).getTime() > now.getTime()) return false;
  if (hasPendingVoucher) return false;
  return !isDepositCovered({ depositRequired: Number(order.depositRequired), amountPaid: Number(order.amountPaid) });
}

/** Plan separe con la fecha límite ya pasada y saldo pendiente. */
export function isLayawayExpired(order: AutomationOrder, today: string): boolean {
  return order.paymentPlan === 'PLAN_SEPARE'
    && !CLOSED.includes(order.status as string)
    && !!order.layawayDeadline
    && order.layawayDeadline < today
    && balanceDue({ total: Number(order.total), amountPaid: Number(order.amountPaid) }) > 0;
}

/** Días que faltan si hoy toca recordatorio del plan separe; null si no. */
export function layawayReminderDue(order: AutomationOrder, today: string): number | null {
  if (order.paymentPlan !== 'PLAN_SEPARE' || CLOSED.includes(order.status as string) || !order.layawayDeadline) return null;
  if (balanceDue({ total: Number(order.total), amountPaid: Number(order.amountPaid) }) <= 0) return null;
  const days = Math.round((Date.parse(order.layawayDeadline) - Date.parse(today)) / 86400000);
  return LAYAWAY_REMINDER_DAYS.includes(days) ? days : null;
}

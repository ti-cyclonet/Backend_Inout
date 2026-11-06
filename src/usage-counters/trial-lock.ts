/** Lo que usa el bloqueo de la respuesta de límites de Authoriza. */
export interface PlanLimitsLike {
  isBillable: boolean;
  startDate: string | null;
  endDate: string | null;
  /** Hay un cambio de plan pedido y aún sin activar (undefined: Authoriza no lo informa). */
  pendingUpgrade?: boolean;
  limits: { variableName: string; maxValue: number }[];
}

export const TRIAL_EXPIRED = 'TRIAL_EXPIRED';

/**
 * Vigencia del plan de prueba (no facturable con nDiasUso). La fecha de fin
 * del contrato manda: si en Authoriza se amplía el plazo, la vigencia se
 * ajusta. nDiasUso solo aplica si no la hay.
 */
export function planTimeline(limits: PlanLimitsLike): { startDate: string; endDate: string; totalDays: number } | null {
  const temporalLimit = limits.limits.find((l) => l.variableName === 'nDiasUso' && l.maxValue > 0);
  if (!temporalLimit || !limits.startDate) return null;
  const startDate = new Date(limits.startDate);
  let endDate = limits.endDate ? new Date(limits.endDate) : null;
  if (!endDate || isNaN(endDate.getTime()) || endDate <= startDate) {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + temporalLimit.maxValue);
  }
  return {
    startDate: limits.startDate,
    endDate: endDate.toISOString(),
    totalDays: Math.round((endDate.getTime() - startDate.getTime()) / 86400000),
  };
}

/**
 * ¿La prueba gratis venció sin que el negocio pidiera el cambio de plan?
 * Entonces InOut no acepta operaciones nuevas ni pedidos en la tienda. Con
 * el cambio pedido se sigue usando la prueba mientras se activa el nuevo plan.
 * Si Authoriza no informa el cambio pendiente, no se bloquea.
 */
export function isTrialLocked(limits: PlanLimitsLike, now = new Date()): boolean {
  if (limits.isBillable || limits.pendingUpgrade !== false) return false;
  const timeline = planTimeline(limits);
  return !!timeline && new Date(timeline.endDate).getTime() <= now.getTime();
}

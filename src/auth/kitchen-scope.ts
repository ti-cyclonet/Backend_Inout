import { ForbiddenException } from '@nestjs/common';

/**
 * Rol de cocina (kitchenInout): solo la pantalla de preparación. Se valida
 * aquí, en la validación del token, para que aplique a TODA ruta con sesión
 * (también a las que no declaran @Roles) y no dependa de ocultar el menú.
 */
export const KITCHEN_ROLE = 'kitchenInout';

const KITCHEN_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'GET', path: /^\/api\/orders\/kitchen$/ },
  { method: 'PATCH', path: /^\/api\/orders\/[^/]+\/status$/ },
  { method: 'GET', path: /^\/api\/business-modules$/ },
  { method: 'GET', path: /^\/api\/tenant-branding\/me$/ },
];

export function kitchenMayAccess(method: string, url: string): boolean {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  return KITCHEN_ROUTES.some((r) => r.method === String(method).toUpperCase() && r.path.test(path));
}

export function assertKitchenScope(role: unknown, method: string, url: string): void {
  if (role === KITCHEN_ROLE && !kitchenMayAccess(method, url)) {
    throw new ForbiddenException('Tu usuario de cocina solo puede usar la pantalla de preparación.');
  }
}

/** Lo que la cocina puede hacer con un pedido: empezar, marcar listo y entregar en el local (recoger o comer allí). */
export function kitchenMayMove(from: string, to: string, fulfillment: string | null | undefined): boolean {
  if (to === 'IN_PRODUCTION') return from === 'CONFIRMED';
  if (to === 'READY') return from === 'CONFIRMED' || from === 'IN_PRODUCTION';
  if (to === 'DELIVERED') return from === 'READY' && (fulfillment === 'PICKUP' || fulfillment === 'DINE_IN');
  return false;
}

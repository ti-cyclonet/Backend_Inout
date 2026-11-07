import { ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { assertKitchenScope, kitchenMayAccess, kitchenMayMove } from './kitchen-scope';

describe('Rol de cocina', () => {
  it('solo entra a la pantalla de preparación', () => {
    expect(kitchenMayAccess('GET', '/api/orders/kitchen')).toBe(true);
    expect(kitchenMayAccess('get', '/api/orders/kitchen?x=1')).toBe(true);
    expect(kitchenMayAccess('PATCH', '/api/orders/abc/status')).toBe(true);
    expect(kitchenMayAccess('GET', '/api/business-modules')).toBe(true);
    // Lo demás no: pedidos con datos del cliente, ventas, configuración…
    expect(kitchenMayAccess('GET', '/api/orders')).toBe(false);
    expect(kitchenMayAccess('GET', '/api/orders/abc')).toBe(false);
    expect(kitchenMayAccess('DELETE', '/api/orders/abc')).toBe(false);
    expect(kitchenMayAccess('PATCH', '/api/business-modules')).toBe(false);
    expect(kitchenMayAccess('GET', '/api/sales')).toBe(false);
    expect(kitchenMayAccess('GET', '/api/orders/kitchen/../stats')).toBe(false);
  });

  it('los demás roles no se ven afectados', () => {
    expect(() => assertKitchenScope('operatorInout', 'GET', '/api/sales')).not.toThrow();
    expect(() => assertKitchenScope('kitchenInout', 'GET', '/api/sales')).toThrow(ForbiddenException);
  });

  it('la validación del token aplica el límite', async () => {
    const strategy = new JwtStrategy({ get: () => 'secreto' } as any);
    const payload = { sub: 'u1', tenantId: 't1', rol: 'kitchenInout' };
    await expect(strategy.validate({ method: 'GET', originalUrl: '/api/orders/kitchen' }, payload)).resolves.toMatchObject({ tenantId: 't1', role: 'kitchenInout' });
    await expect(strategy.validate({ method: 'GET', originalUrl: '/api/customers' }, payload)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pasos permitidos para un pedido', () => {
    expect(kitchenMayMove('CONFIRMED', 'IN_PRODUCTION', 'DELIVERY')).toBe(true);
    expect(kitchenMayMove('IN_PRODUCTION', 'READY', 'DELIVERY')).toBe(true);
    expect(kitchenMayMove('CONFIRMED', 'READY', null)).toBe(true);
    expect(kitchenMayMove('READY', 'DELIVERED', 'PICKUP')).toBe(true);
    expect(kitchenMayMove('READY', 'DELIVERED', 'DINE_IN')).toBe(true);
    expect(kitchenMayMove('READY', 'DELIVERED', 'DELIVERY')).toBe(false);
    expect(kitchenMayMove('READY', 'OUT_FOR_DELIVERY', 'DELIVERY')).toBe(false);
    expect(kitchenMayMove('DELIVERED', 'INVOICED', 'PICKUP')).toBe(false);
    expect(kitchenMayMove('CONFIRMED', 'CANCELLED', 'PICKUP')).toBe(false);
  });
});

import { ForbiddenException } from '@nestjs/common';
import { LimitEnforcementService } from './limit-enforcement.service';
import { FeatureGuard } from './guards/feature.guard';

/** Funciones del plan (encendidas/apagadas) y límites contra el conteo real. */
describe('Funciones y límites del plan', () => {
  const limits = (list: any[]) => ({ contractId: 'c', packageName: 'PRO', isBillable: true, startDate: null, endDate: null, pendingUpgrade: false, limits: list });
  const make = (list: any[] | Error) => {
    const s = new LimitEnforcementService({} as any, {} as any, { get: () => undefined } as any, {} as any);
    jest.spyOn(s, 'fetchLimits').mockImplementation(async () => { if (list instanceof Error) throw list; return limits(list) as any; });
    return s;
  };
  const credito = (maxValue: number) => ({ variableName: 'fCredito', displayName: 'Ventas a crédito', maxValue, targetApplication: 'Inout', limitType: 'feature' });

  it('la función encendida (1) o no definida en el paquete deja pasar', async () => {
    await expect(make([credito(1)]).assertFeature('t', 'fCredito')).resolves.toBeUndefined();
    await expect(make([]).assertFeature('t', 'fCredito')).resolves.toBeUndefined();
  });

  it('la función apagada (0) responde FEATURE_DISABLED con un mensaje claro', async () => {
    await expect(make([credito(0)]).assertFeature('t', 'fCredito')).rejects.toMatchObject({
      response: { error: 'FEATURE_DISABLED', feature: 'fCredito', message: 'Tu plan no incluye las ventas a crédito. Para usarla, cambia de plan en Mi plan.' },
    });
  });

  it('si Authoriza no responde, no bloquea', async () => {
    expect(await make(new Error('caído')).isFeatureEnabled('t', 'fCredito')).toBe(true);
  });

  it('bodegas: contra las activas reales', async () => {
    const s = make([{ variableName: 'nBodegas', displayName: 'Bodegas', maxValue: 3, targetApplication: 'Inout' }]);
    await expect(s.assertBelowLimit('t', 'nBodegas', 2)).resolves.toBeUndefined();
    await expect(s.assertBelowLimit('t', 'nBodegas', 3)).rejects.toMatchObject({ response: { error: 'LIMIT_REACHED', resource: 'Bodegas', limit: 3 } });
  });

  it('correos automáticos: sin cupo no se envía; si Authoriza no responde, sí', async () => {
    const s = make([]);
    jest.spyOn(s, 'validateAndIncrement').mockRejectedValueOnce(new ForbiddenException({ error: 'LIMIT_REACHED' }));
    expect(await s.tryConsume('t', 'nCorreos')).toBe(false);
    jest.spyOn(s, 'validateAndIncrement').mockRejectedValueOnce(new Error('Authoriza no responde'));
    expect(await s.tryConsume('t', 'nCorreos')).toBe(true);
  });

  it('FeatureGuard usa la función de la ruta y el negocio de la sesión', async () => {
    const s = make([credito(0)]);
    const reflector = { getAllAndOverride: () => 'fCredito' } as any;
    const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user: { tenantId: 't' } }) }) } as any;
    await expect(new FeatureGuard(reflector, s).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    const free = { getAllAndOverride: () => undefined } as any;
    await expect(new FeatureGuard(free, s).canActivate(ctx)).resolves.toBe(true);
  });
});

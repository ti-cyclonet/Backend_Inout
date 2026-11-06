import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { isTrialLocked, planTimeline, TRIAL_EXPIRED } from './trial-lock';
import { TrialLockInterceptor } from './interceptors/trial-lock.interceptor';
import { STORE_PAUSED_MESSAGE, TRIAL_EXPIRED_MESSAGE } from './limit-enforcement.service';

const NOW = new Date('2026-11-06T12:00:00Z');
const trial = (over: Record<string, any> = {}) => ({
  isBillable: false,
  startDate: '2026-10-01T00:00:00Z',
  endDate: '2026-10-31T00:00:00Z',
  pendingUpgrade: false,
  limits: [{ variableName: 'nDiasUso', maxValue: 30 }],
  ...over,
});

describe('isTrialLocked', () => {
  it('bloquea la prueba vencida sin cambio de plan', () => {
    expect(isTrialLocked(trial(), NOW)).toBe(true);
  });
  it('no bloquea si pidió el cambio de plan (sigue con la prueba mientras se activa)', () => {
    expect(isTrialLocked(trial({ pendingUpgrade: true }), NOW)).toBe(false);
  });
  it('no bloquea mientras la prueba está vigente', () => {
    expect(isTrialLocked(trial({ endDate: '2026-11-10T00:00:00Z' }), NOW)).toBe(false);
  });
  it('no bloquea un plan pago ni un plan sin vigencia', () => {
    expect(isTrialLocked(trial({ isBillable: true }), NOW)).toBe(false);
    expect(isTrialLocked(trial({ limits: [] }), NOW)).toBe(false);
  });
  it('si Authoriza no informa el cambio pendiente, no bloquea', () => {
    expect(isTrialLocked(trial({ pendingUpgrade: undefined }), NOW)).toBe(false);
  });
  it('sin fecha de fin, la vigencia sale de nDiasUso', () => {
    expect(planTimeline(trial({ endDate: null }))!.endDate).toBe('2026-10-31T00:00:00.000Z');
    expect(isTrialLocked(trial({ endDate: null }), NOW)).toBe(true);
  });
});

describe('TrialLockInterceptor', () => {
  const ctx = (method: string, user: any) => ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
  }) as any;
  const handler = { handle: jest.fn(() => of('hecho')) };
  const make = (locked: boolean) => {
    const assertNotTrialLocked = jest.fn(async (_t: string, message: string) => {
      if (locked) throw new ForbiddenException({ error: TRIAL_EXPIRED, message });
    });
    return { interceptor: new TrialLockInterceptor({ assertNotTrialLocked } as any), assertNotTrialLocked };
  };
  beforeEach(() => handler.handle.mockClear());

  it('bloqueado: rechaza lo que escribe el equipo del negocio', async () => {
    const { interceptor } = make(true);
    await expect(lastValueFrom(interceptor.intercept(ctx('POST', { tenantId: 't1', role: 'adminInout' }), handler)))
      .rejects.toMatchObject({ response: { error: TRIAL_EXPIRED, message: TRIAL_EXPIRED_MESSAGE } });
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('bloqueado: al cliente de la tienda le dice que la tienda está en pausa', async () => {
    const { interceptor } = make(true);
    await expect(lastValueFrom(interceptor.intercept(ctx('POST', { tenantId: 't1', role: 'clienteInout' }), handler)))
      .rejects.toMatchObject({ response: { message: STORE_PAUSED_MESSAGE } });
  });

  it('las consultas y las rutas sin sesión siguen', async () => {
    const { interceptor, assertNotTrialLocked } = make(true);
    expect(await lastValueFrom(interceptor.intercept(ctx('GET', { tenantId: 't1' }), handler))).toBe('hecho');
    expect(await lastValueFrom(interceptor.intercept(ctx('POST', undefined), handler))).toBe('hecho');
    expect(assertNotTrialLocked).not.toHaveBeenCalled();
  });

  it('sin bloqueo, la operación pasa', async () => {
    const { interceptor } = make(false);
    expect(await lastValueFrom(interceptor.intercept(ctx('PATCH', { tenantId: 't1' }), handler))).toBe('hecho');
  });
});

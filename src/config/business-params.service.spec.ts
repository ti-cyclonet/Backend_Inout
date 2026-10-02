import { BusinessParamsService, parseBooleanParam } from './business-params.service';

/**
 * Costeo: el valor mensual del plan de InOut entra a los costos indirectos
 * solo si el negocio lo decide (INCLUIR_PLAN_INOUT = Sí).
 */
describe('BusinessParamsService · plan de InOut en el costeo', () => {
  const config = { get: () => 'http://authoriza' } as any;
  let planCalls = 0;

  /** Authoriza falso: período activo, sus parámetros y el valor del plan. */
  const mockAuthoriza = (params: { code: string; value: string; dataType?: string }[], plan: any = { monthlyValue: 89000, packageName: 'INOUT PRO' }) => {
    planCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      const json = (body: any, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
      if (url.includes('/periods/active/tenant/')) return json({ id: 'p1' });
      if (url.includes('/customer-parameters-periods/period/')) {
        return json(params.map((p) => ({ status: 'ACTIVE', value: p.value, customerParameter: { code: p.code, dataType: p.dataType || 'number' } })));
      }
      if (url.includes('/plan-cost')) { planCalls++; return plan ? json(plan) : json({}, false); }
      return json({}, false);
    }) as any;
  };

  it('Sí/No: acepta SI, Sí, true y 1', () => {
    expect(['SI', 'Sí', 'true', '1'].every(parseBooleanParam)).toBe(true);
    expect(['NO', 'no', '0', '', null].some(parseBooleanParam)).toBe(false);
  });

  it('sin la decisión: el plan no entra y ni se consulta', async () => {
    mockAuthoriza([{ code: 'COSTO_ARRIENDO', value: '1000000' }]);
    const o = await new BusinessParamsService(config).getMonthlyOverhead('t1');
    expect(o.total).toBe(1000000);
    expect(o.breakdown.planInout).toBe(0);
    expect(o.includesInoutPlan).toBe(false);
    expect(planCalls).toBe(0);
  });

  it('con la decisión en Sí: suma el valor mensual del plan', async () => {
    mockAuthoriza([{ code: 'COSTO_ARRIENDO', value: '1000000' }, { code: 'INCLUIR_PLAN_INOUT', value: 'SI', dataType: 'boolean' }]);
    const o = await new BusinessParamsService(config).getMonthlyOverhead('t1');
    expect(o.breakdown.planInout).toBe(89000);
    expect(o.total).toBe(1089000);
    expect(o.inoutPlanName).toBe('INOUT PRO');
  });

  it('el valor del plan se cachea (no consulta Authoriza en cada producción)', async () => {
    mockAuthoriza([{ code: 'INCLUIR_PLAN_INOUT', value: 'SI', dataType: 'boolean' }]);
    const service = new BusinessParamsService(config);
    await service.getMonthlyOverhead('t1');
    await service.getMonthlyOverhead('t1');
    expect(planCalls).toBe(1);
  });

  it('si Authoriza no responde, el costeo sigue sin el plan y lo avisa', async () => {
    mockAuthoriza([{ code: 'COSTO_AGUA', value: '50000' }, { code: 'INCLUIR_PLAN_INOUT', value: 'SI', dataType: 'boolean' }], null);
    const o = await new BusinessParamsService(config).getMonthlyOverhead('t1');
    expect(o.total).toBe(50000);
    expect(o.inoutPlanUnavailable).toBe(true);
  });
});

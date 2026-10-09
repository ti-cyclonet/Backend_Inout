import { MarketplaceStatsService } from './marketplace-stats.service';

const T = 'a5b98f50-25b6-48ce-87d7-c7d4ccff467e';
const P = '04cffb0c-ad33-46f4-8f7d-23b1d606e705';

function montar(respuestas: any[][]) {
  const consultas: Array<{ sql: string; params: any[] }> = [];
  const repo: any = { query: jest.fn(async (sql: string, params: any[]) => { consultas.push({ sql, params }); return respuestas.shift() || []; }) };
  return { servicio: new MarketplaceStatsService(repo), consultas };
}

describe('MarketplaceStatsService', () => {
  it('registra la vista solo si el ítem es de la tienda', async () => {
    const { servicio, consultas } = montar([[{ existe: true }], []]);
    await servicio.registrarVista(T, P);
    expect(consultas).toHaveLength(2);
    expect(consultas[1].sql).toContain('ON CONFLICT');
    expect(consultas[1].params).toEqual([T, P]);
  });

  it('ítem de otra tienda o inexistente: 404 y no suma', async () => {
    const { servicio, consultas } = montar([[{ existe: false }]]);
    await expect(servicio.registrarVista(T, P)).rejects.toMatchObject({ status: 404 });
    expect(consultas).toHaveLength(1);
  });

  it('ids con formato inválido: 400 sin consultar la base', async () => {
    const { servicio, consultas } = montar([]);
    await expect(servicio.registrarVista(T, "x';drop")).rejects.toMatchObject({ status: 400 });
    await expect(servicio.estadisticas('')).rejects.toMatchObject({ status: 400 });
    expect(consultas).toHaveLength(0);
  });

  it('une vistas y unidades vendidas por ítem', async () => {
    const { servicio } = montar([
      [{ id: P, n: 7 }, { id: 'solo-vistas-0001', n: 3 }],
      [{ id: P, n: '69.00' }, { id: 'solo-ventas-0001', n: '2.5' }],
    ]);
    expect(await servicio.estadisticas(T)).toEqual({
      [P]: { views: 7, sold: 69 },
      'solo-vistas-0001': { views: 3, sold: 0 },
      'solo-ventas-0001': { views: 0, sold: 3 },
    });
  });
});

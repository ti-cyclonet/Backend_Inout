import { FeedbackService } from './feedback.service';

const DAY = 86400000;

function crear(o: { canSubmit?: boolean; sales?: number; market?: number; firstSale?: Date | null } = {}) {
  const qb = (at: Date | null) => ({ select: () => ({ where: () => ({ getRawOne: async () => ({ at }) }) }) });
  const sales = { count: jest.fn(async () => o.sales ?? 0), createQueryBuilder: () => qb(o.firstSale ?? null) };
  const orders = { count: jest.fn(async () => o.market ?? 0), createQueryBuilder: () => qb(null) };
  const params = { getParams: jest.fn(async () => ({ NEGOCIO_NOMBRE: 'Arepas Jimmy Lon' })) };
  const branding = { get: jest.fn(async () => ({ logoUrl: 'https://res.cloudinary.com/x/logo.png', logoWebUrl: 'https://res.cloudinary.com/x/f_auto/logo.png' })) };
  const service = new FeedbackService(sales as any, orders as any, params as any, branding as any);
  const fetchMock = jest.fn(async (url: string, init?: any) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('/user/') ? { canSubmit: o.canSubmit ?? true } : { id: 't1', status: 'PENDIENTE', echo: JSON.parse(init?.body || '{}') }),
  }));
  (global as any).fetch = fetchMock;
  return { service, fetchMock };
}

const user = { id: 'u1', email: 'laura@arepas.co', tenantId: 'tn1' };

describe('opiniones en InOut', () => {
  it('envía la opinión a Authoriza con el nombre y el logo del negocio', async () => {
    const { service, fetchMock } = crear();
    const r: any = await service.submit(user, { rating: 5, comment: 'Me ordenó el inventario.', highlights: ['inventario'], consentPublish: true, consentLogo: true, authorName: 'Laura Gómez', city: 'Cartagena' });
    expect(fetchMock.mock.calls[0][0]).toContain('/api/testimonials');
    expect(r.echo).toMatchObject({ application: 'InOut', tenantId: 'tn1', userId: 'u1', businessName: 'Arepas Jimmy Lon', logoUrl: 'https://res.cloudinary.com/x/f_auto/logo.png', city: 'Cartagena', consentLogo: true });
  });

  it('invita al mes de uso, a las 100 ventas o con el primer pedido del Market', async () => {
    expect(await crear({ firstSale: new Date(Date.now() - 31 * DAY) }).service.invitation(user)).toMatchObject({ invite: true, reason: 'Ya llevas un mes con InOut.' });
    expect(await crear({ sales: 120 }).service.invitation(user)).toMatchObject({ invite: true, reason: '¡Llegaste a 120 ventas con InOut!' });
    expect(await crear({ market: 1 }).service.invitation(user)).toMatchObject({ invite: true });
    expect(await crear({ firstSale: new Date(Date.now() - 5 * DAY), sales: 10 }).service.invitation(user)).toMatchObject({ invite: false });
  });

  it('no invita si ya opinó hace poco', async () => {
    expect(await crear({ sales: 500, canSubmit: false }).service.invitation(user)).toMatchObject({ canSubmit: false, invite: false });
  });
});

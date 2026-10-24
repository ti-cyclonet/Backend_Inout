import { CreditRemindersService } from './credit-reminders.service';

describe('recordatorio de cartera: marca de la tienda', () => {
  const params = (p: Record<string, any>) => ({ getParams: jest.fn().mockResolvedValue(p) });
  const branding = (logoPdfUrl: string | null) => ({ get: jest.fn().mockResolvedValue({ logoPdfUrl }) });

  it('usa el nombre de la tienda (NEGOCIO_NOMBRE) y el logo del propio tenant', async () => {
    const b = branding('https://res.cloudinary.com/demo/image/upload/c_limit,w_400,h_400,f_png/tienda.png');
    const s = new CreditRemindersService({} as any, params({ NEGOCIO_NOMBRE: 'Arepas Jimmy Lon' }) as any, b as any);
    const brand = await s.brand('tenant-jimmy');
    expect(brand).toMatchObject({ name: 'Arepas Jimmy Lon', logoUrl: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_400,h_400,f_png/tienda.png' });
    expect(b.get).toHaveBeenCalledWith('tenant-jimmy');
  });

  it('sin logo cargado no inventa uno', async () => {
    const s = new CreditRemindersService({} as any, params({ NEGOCIO_NOMBRE: 'Arepas Jimmy Lon' }) as any, branding(null) as any);
    expect((await s.brand('t')).logoUrl).toBeNull();
  });
});

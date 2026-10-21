import { OrderStatus } from '../orders/entities/order.entity';
import { ModulePanelsService } from './module-panels.service';

/** "Lo que te trajo el Market": pedidos MARKET del mes, clientes y clientes nuevos. */
describe('marketContribution', () => {
  const monthStart = new Date('2026-10-01T05:00:00Z');
  const prevMonthStart = new Date('2026-09-01T05:00:00Z');

  function service(market: any[], earlier: any[]) {
    const results = [market, earlier];
    const qb = () => {
      const data = results.shift();
      const chain: any = { where: () => chain, select: () => chain, getMany: async () => data };
      return chain;
    };
    const orders = { createQueryBuilder: qb };
    const s: any = new (ModulePanelsService as any)(null, null, null, null, null, null, null, orders, null, null, null);
    return (s as any).marketContribution('t1', monthStart, prevMonthStart);
  }

  const o = (createdAt: string, total: number, customer: { id?: string; email?: string }) => ({
    createdAt: new Date(createdAt), total, customerId: customer.id || null, customerEmail: customer.email || null, status: OrderStatus.DELIVERED,
  });

  it('cuenta los pedidos del mes, su valor y los clientes nuevos', async () => {
    const r = await service(
      [
        o('2026-10-03T15:00:00Z', 30000, { id: 'c1' }), // ya había comprado
        o('2026-10-05T15:00:00Z', 20000, { email: 'Nueva@Correo.com' }), // nueva (por correo)
        o('2026-10-07T15:00:00Z', 10000, { email: 'nueva@correo.com' }), // misma clienta
        o('2026-09-20T15:00:00Z', 15000, { id: 'c9' }), // mes anterior
      ],
      [{ customerId: 'c1', customerEmail: null }],
    );
    expect(r).toEqual({ orders: 3, revenue: 60000, customers: 2, newCustomers: 1, ordersPrevMonth: 1, revenuePrevMonth: 15000 });
  });

  it('sin pedidos del Market todo queda en cero', async () => {
    expect(await service([], [])).toEqual({ orders: 0, revenue: 0, customers: 0, newCustomers: 0, ordersPrevMonth: 0, revenuePrevMonth: 0 });
  });
});

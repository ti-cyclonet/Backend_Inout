import { OrdersService } from './orders.service';
import { OrderStatus } from './entities/order.entity';

describe('OrdersService.getKitchen (pantalla de cocina)', () => {
  const service: any = Object.create(OrdersService.prototype);
  const base = { tenantId: 't1', customerName: 'Ana', notes: null, fulfillment: 'PICKUP', deliveryZone: null, createdAt: new Date('2026-11-06T15:00:00Z'), scheduledStart: null, scheduledEnd: null, customerPhone: '300', total: 20000 };

  beforeEach(() => {
    service.getQueue = jest.fn(async () => ({
      settings: { stageDurations: { CONFIRMED: 10, IN_PRODUCTION: 20 } },
      orders: [{ orderId: 'o1', needsProduction: true, stageEnteredAt: '2026-11-06T15:01:00Z', stageDueAt: '2026-11-06T15:21:00Z', estimatedStartAt: null, estimatedReadyAt: null }],
    }));
    service.orderRepository = {
      find: jest.fn(async () => [
        { ...base, id: 'o1', orderCode: 'PD-1', status: OrderStatus.IN_PRODUCTION, items: [
          { productName: 'Arepa', quantity: '2', itemType: 'product', choices: [{ group: 'Proteínas', options: ['Pollo', 'Cerdo'] }] },
          { productName: 'Hamburguesa', quantity: 2, itemType: 'product', combo: { groupId: 'g1', comboId: 'c1', comboName: 'Combo pareja', comboQuantity: 1, comboUnitPrice: 30000 } },
          { productName: 'Bono', quantity: 1, itemType: 'gift_card' },
        ] },
        { ...base, id: 'o2', orderCode: 'PD-2', status: OrderStatus.CONFIRMED, items: [{ productName: 'Bono', quantity: 1, itemType: 'gift_card' }] },
      ]),
    };
  });

  it('trae lo que hay que preparar con sus tiempos, sin bonos ni datos del cliente', async () => {
    const res = await service.getKitchen('t1');
    const where = service.orderRepository.find.mock.calls[0][0].where.map((w: any) => w.status);
    expect(where).toEqual([OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY]);
    expect(res.stageDurations).toEqual({ CONFIRMED: 10, IN_PRODUCTION: 20 });
    expect(res.orders).toHaveLength(1);
    expect(res.orders[0]).toMatchObject({ orderCode: 'PD-1', fulfillment: 'PICKUP', stageDueAt: '2026-11-06T15:21:00Z' });
    expect(res.orders[0].items).toEqual([
      { productName: 'Arepa', quantity: 2, options: ['Proteínas: Pollo, Cerdo'] },
      { productName: 'Combo pareja', quantity: 1, components: ['2 x Hamburguesa'] },
    ]);
    expect(res.orders[0].customerPhone).toBeUndefined();
    expect(res.orders[0].total).toBeUndefined();
  });
});

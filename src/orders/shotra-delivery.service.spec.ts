import { OrderStatus } from './entities/order.entity';
import { ShotraDeliveryService } from './shotra-delivery.service';

describe('ShotraDeliveryService.syncOrder', () => {
  const repo = { update: jest.fn(), find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
  const orders = { updateStatus: jest.fn() };
  const service = new ShotraDeliveryService(repo as any, orders as any);
  const order = (status: OrderStatus) => ({ id: 'o1', tenantId: 't1', orderCode: 'P-1', status, shotraRequestId: 'r1' }) as any;
  const shotra = (requestStatus: string, contract: any) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ requestId: 'r1', requestStatus, contract }) }) as any;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_API_KEY = 'k';
  });

  it('contrato cerrado → Entregado (como sistema)', async () => {
    shotra('ASSIGNED', { code: 'C-1', status: 'COMPLETED', signed: true, completedAt: null });
    expect(await service.syncOrder(order(OrderStatus.OUT_FOR_DELIVERY))).toBe(true);
    expect(orders.updateStatus).toHaveBeenCalledWith('o1', 't1', OrderStatus.DELIVERED, undefined, {}, { system: true });
  });

  it('contrato firmado con el pedido Listo → En reparto', async () => {
    shotra('ASSIGNED', { code: 'C-1', status: 'SIGNED', signed: true, completedAt: null });
    expect(await service.syncOrder(order(OrderStatus.READY))).toBe(true);
    expect(orders.updateStatus).toHaveBeenCalledWith('o1', 't1', OrderStatus.OUT_FOR_DELIVERY, undefined, {}, { system: true });
  });

  it('sin firmar todavía → no cambia', async () => {
    shotra('OPEN', null);
    expect(await service.syncOrder(order(OrderStatus.READY))).toBe(false);
    expect(orders.updateStatus).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('solicitud cancelada → se desliga y vuelve el avance manual', async () => {
    shotra('CANCELLED', null);
    expect(await service.syncOrder(order(OrderStatus.READY))).toBe(true);
    expect(repo.update).toHaveBeenCalledWith({ id: 'o1' }, { shotraRequestId: null });
    expect(orders.updateStatus).not.toHaveBeenCalled();
  });
});

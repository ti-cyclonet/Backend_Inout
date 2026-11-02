import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { addDays, todayCo } from '../credit/credit.service';

/**
 * SalesService con solo lo que usan voidSale y la fecha de la venta:
 * dataSource.transaction con un EntityManager falso que guarda en memoria.
 */
function setup(sale: any, outs: any[]) {
  const saved: any[] = [];
  const stockUpdates: { sql: string; qty: number; id: string }[] = [];
  const manager: any = {
    findOne: async () => sale,
    find: async () => outs,
    save: async (a: any, b?: any) => { saved.push(b ? { entity: a, ...b } : a); return b || a; },
    query: async (sql: string, params: any[]) => { stockUpdates.push({ sql, qty: params[0], id: params[1] }); },
  };
  const credit = { voidReceivableForSource: jest.fn(async () => null) };
  const dataSource: any = { transaction: (fn: any) => fn(manager) };
  const service = new SalesService(null as any, null as any, null as any, null as any, null as any, null as any, dataSource, null as any, credit as any, null as any);
  return { service, saved, stockUpdates, credit };
}

const baseSale = () => ({ strId: 's1', strTenantId: 't1', strInvoiceCode: 'ABC-F-00007', paymentType: 'CONTADO', dtmVoidedAt: null });

describe('SalesService.voidSale', () => {
  it('devuelve al inventario cada salida de la venta y la marca anulada', async () => {
    const outs = [
      { strProductId: 'p1', fltQuantity: '2.00', fltUnitPrice: '5000.00' },
      { strMaterialId: 'm1', fltQuantity: '500.00', fltUnitPrice: '12.00' },
    ];
    const sale: any = baseSale();
    const { service, saved, stockUpdates, credit } = setup(sale, outs);

    const r = await service.voidSale('t1', 's1', '  Cliente equivocado ', 'admin@x.co');

    expect(stockUpdates.map((u) => [u.id, u.qty])).toEqual([['p1', 2], ['m1', 500]]);
    expect(stockUpdates.every((u) => u.sql.includes('+ $1'))).toBe(true);
    expect(stockUpdates[0].sql).toContain('manufacturing.products');
    expect(stockUpdates[1].sql).toContain('manufacturing.materials');
    const ins = saved.filter((s) => s.entity === InventoryMovement);
    expect(ins).toHaveLength(2);
    expect(ins[0]).toMatchObject({ strType: 'IN', strReason: 'SALE_VOID', strProductId: 'p1', strReferenceId: 's1', dtmDate: todayCo() });
    expect(ins[1]).toMatchObject({ strMaterialId: 'm1' });
    expect(sale.dtmVoidedAt).toBeInstanceOf(Date);
    expect(sale.strVoidReason).toBe('Cliente equivocado');
    expect(sale.strVoidedBy).toBe('admin@x.co');
    expect(credit.voidReceivableForSource).not.toHaveBeenCalled();
    expect(r.restoredItems).toBe(2);
  });

  it('a crédito anula también la cuenta por cobrar', async () => {
    const { service, credit } = setup({ ...baseSale(), paymentType: 'CREDITO' }, []);
    await service.voidSale('t1', 's1', 'Error', undefined);
    expect(credit.voidReceivableForSource).toHaveBeenCalledWith(expect.anything(), 't1', 'SALE', 's1', 'Venta ABC-F-00007 anulada: Error');
  });

  it('no anula dos veces ni sin motivo', async () => {
    const { service } = setup({ ...baseSale(), dtmVoidedAt: new Date() }, []);
    await expect(service.voidSale('t1', 's1', 'x')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup(baseSale(), []).service.voidSale('t1', 's1', '   ')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SalesService: fecha de la venta', () => {
  const { service } = setup(baseSale(), []);
  const saleDay = (d: string) => (service as any).saleDay(d);

  it('acepta días anteriores dentro del límite', () => {
    const d = addDays(todayCo(), -3);
    expect(saleDay(d)).toBe(d);
    expect(saleDay(`${d}T00:00:00.000Z`)).toBe(d);
  });

  it('una fecha futura o inválida se toma como hoy', () => {
    expect(saleDay(addDays(todayCo(), 1))).toBe(todayCo());
    expect(saleDay('')).toBe(todayCo());
  });

  it('rechaza fechas de hace más del límite', () => {
    expect(() => saleDay(addDays(todayCo(), -(SalesService.MAX_BACKDATE_DAYS + 1)))).toThrow(BadRequestException);
  });
});

import { buyerFromCustomer, docTypeFor, linesFromSale } from './sale-einvoice';
import { EinvoicingService } from './einvoicing.service';

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Total como lo calcula la DIAN con las líneas (base − descuento + impuesto). */
const dianTotal = (lines: ReturnType<typeof linesFromSale>) =>
  round2(lines.reduce((s, l) => { const base = round2(l.quantity * l.unitPrice - (l.discount || 0)); return s + base + round2(base * l.taxRate / 100); }, 0));

describe('Facturación electrónica · venta → documento', () => {
  it('comprador desde el cliente; sin documento es consumidor final', () => {
    expect(buyerFromCustomer({ documentType: 'NIT', documentNumber: '901.565.464', documentDv: '3', businessName: 'Arepas SAS', contactEmail: 'pagos@arepas.co' }))
      .toEqual({ idType: '31', idNumber: '901565464', checkDigit: 3, name: 'Arepas SAS', email: 'pagos@arepas.co', address: null });
    expect(buyerFromCustomer({ documentType: 'CC', documentNumber: '1047000111', firstName: 'Laura', firstSurname: 'Gómez' }))
      .toEqual(expect.objectContaining({ idType: '13', name: 'Laura Gómez', email: null }));
    expect(buyerFromCustomer({ firstName: 'Cliente rápido' })).toBeNull();
    expect(buyerFromCustomer(null)).toBeNull();
  });

  it('factura si el cliente tiene correo o la venta es a crédito; si no, POS electrónico', () => {
    expect(docTypeFor({ idType: '13', idNumber: '1', name: 'x', email: 'a@b.co' }, 'CONTADO')).toBe('FACTURA');
    expect(docTypeFor({ idType: '13', idNumber: '1', name: 'x', email: null }, 'CONTADO')).toBe('POS');
    expect(docTypeFor(null, 'CONTADO')).toBe('POS');
    expect(docTypeFor(null, 'CREDITO')).toBe('FACTURA');
  });

  it('líneas con el impuesto del negocio; el descuento queda antes del impuesto y el total es lo que pagó el cliente', () => {
    // InOut: subtotal 30.000 + IVA 19 % (5.700) − descuento 2.380 = 33.320
    const sale = { items: [{ productName: 'Arepa', quantity: 2, unitPrice: 10000, productId: 'p1' }, { productName: 'Jugo', quantity: 2, unitPrice: 5000 }], discount: 2380 };
    const lines = linesFromSale(sale, { taxType: 'IVA', percent: 19 });
    expect(lines.map((l) => [l.description, l.taxCode, l.taxRate])).toEqual([['Arepa', 'IVA', 19], ['Jugo', 'IVA', 19]]);
    expect(round2(lines.reduce((s, l) => s + (l.discount || 0), 0))).toBe(2000);
    expect(dianTotal(lines)).toBe(33320);
  });

  it('sin impuesto configurado las líneas van excluidas', () => {
    const lines = linesFromSale({ items: [{ productName: 'Pan', quantity: 3, unitPrice: 1000 }], discount: 0 }, { taxType: 'NONE', percent: 0 });
    expect(lines[0]).toEqual(expect.objectContaining({ taxCode: 'EXCLUIDO', taxRate: 0 }));
    expect(dianTotal(lines)).toBe(3000);
  });
});

describe('Facturación electrónica · servicio de InOut', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  const make = (sale: any, status: any) => {
    const updates: any[] = [];
    const repo = { findOne: jest.fn(async () => sale), update: jest.fn(async (id: string, data: any) => updates.push({ id, data })) };
    const dataSource = { getRepository: jest.fn(() => repo) };
    const params = { getTaxInfo: jest.fn(async () => ({ taxType: 'IVA', percent: 19 })) };
    const calls: any[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      const body = String(url).endsWith('/status') ? status : { id: 'doc-1', fullNumber: 'POS17', status: 'PENDIENTE' };
      return { ok: true, status: 200, json: async () => body } as any;
    }) as any;
    return { service: new EinvoicingService(dataSource as any, params as any), updates, calls };
  };

  it('en configuración (o sin el complemento activo) la venta no emite nada', async () => {
    const { service, calls, updates } = make({ strId: 's1' }, { available: false, addon: null });
    await service.emitForSale('t1', 's1');
    expect(calls.filter((c) => c.url.endsWith('/documents'))).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('activa: emite el POS de una venta de mostrador y lo guarda en la venta', async () => {
    const sale = { strId: 's1', strTenantId: 't1', strInvoiceCode: 'SC-F-00231', paymentType: 'CONTADO', paymentMethod: 'EFECTIVO', items: [{ productName: 'Arepa', quantity: 1, unitPrice: 10000 }], discount: 0 };
    const { service, calls, updates } = make(sale, { available: true, addon: { status: 'ACTIVO' } });
    await service.emitForSale('t1', 's1');
    const doc = calls.find((c) => c.url.endsWith('/documents'));
    expect(doc.body).toEqual(expect.objectContaining({ tenantId: 't1', sourceApp: 'INOUT', sourceId: 's1', type: 'POS', buyer: null }));
    expect(updates[0].data).toEqual(expect.objectContaining({ strEinvoiceId: 'doc-1', strEinvoiceNumber: 'POS17', strEinvoiceStatus: 'PENDIENTE' }));
  });
});

import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SaleReceiptMailService, isEmail } from './sale-receipt-mail.service';

describe('SaleReceiptMailService', () => {
  const pdf = Buffer.from('%PDF-1.3 tiquete').toString('base64');
  const sale: any = {
    strId: 's1', strTenantId: 't1', strInvoiceCode: 'SC-F-00232', customerName: 'María <b>Fer</b>',
    subtotal: 29000, tax: 0, discount: 0, total: 29000, paymentType: 'CONTADO', paymentMethod: 'NEQUI',
    dtmCreationDate: new Date('2026-11-06T16:29:00Z'),
    items: [{ productName: 'Arepa combinada', quantity: 2, unitPrice: 12000, total: 24000 }, { productName: 'Jugo de piña', quantity: 1, unitPrice: 5000, total: 5000 }],
  };
  let fetchMock: jest.Mock;
  let service: SaleReceiptMailService;

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    (global as any).fetch = fetchMock;
    const repo = { findOne: jest.fn(async ({ where }) => (where.strId === 's1' && where.strTenantId === 't1' ? sale : null)) };
    const params = { getParams: jest.fn(async () => ({ NEGOCIO_NOMBRE: 'Arepas La Esquina', NEGOCIO_NIT: '901.234.567-8' })) };
    const branding = { get: jest.fn(async () => ({ logoPdfUrl: 'https://res.cloudinary.com/x/logo.png', receiptNote: 'El domicilio se acuerda\ncon el <domiciliario>' })) };
    service = new SaleReceiptMailService(repo as any, params as any, branding as any);
  });

  it('envía la plantilla con el detalle escapado y el PDF adjunto', async () => {
    await expect(service.send('t1', 's1', ' Cliente@Correo.co ', pdf)).resolves.toEqual({ success: true, to: 'cliente@correo.co' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/notifications\/send$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: 'cliente@correo.co', templateCode: 'INOUT_SALE_RECEIPT', tenantId: 't1' });
    expect(body.variables.businessName).toBe('Arepas La Esquina');
    expect(body.variables.customerName).toBe('María &lt;b&gt;Fer&lt;/b&gt;');
    expect(body.variables.itemsRows).toContain('Arepa combinada');
    expect(body.variables.paymentText).toBe('Pago de contado · Nequi');
    expect(body.variables.logoBlock).toContain('logo.png');
    expect(body.variables.receiptNote).toContain('El domicilio se acuerda<br>con el &lt;domiciliario&gt;');
    expect(body.attachments[0]).toMatchObject({ filename: 'Comprobante SC-F-00232.pdf', contentType: 'application/pdf' });
  });

  it('valida el correo, el PDF y que la venta sea del negocio', async () => {
    await expect(service.send('t1', 's1', 'no-es-correo', pdf)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send('t1', 's1', 'a@b.co', Buffer.from('hola').toString('base64'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send('otro', 's1', 'a@b.co', pdf)).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si Authoriza no lo envía, avisa', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(service.send('t1', 's1', 'a@b.co', pdf)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('isEmail', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.co')).toBe(false);
  });
});

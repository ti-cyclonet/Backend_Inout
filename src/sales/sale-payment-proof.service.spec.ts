import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalePaymentProofService } from './sale-payment-proof.service';

describe('SalePaymentProofService', () => {
  const img = (over: any = {}) => ({ mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), ...over }) as any;
  let sales: Record<string, any>;
  let upload: jest.Mock;
  let service: SalePaymentProofService;

  beforeEach(() => {
    sales = {
      tarjeta: { strId: 'tarjeta', strTenantId: 't1', paymentType: 'CONTADO', paymentMethod: 'TARJETA' },
      efectivo: { strId: 'efectivo', strTenantId: 't1', paymentType: 'CONTADO', paymentMethod: 'EFECTIVO' },
      credito: { strId: 'credito', strTenantId: 't1', paymentType: 'CREDITO', paymentMethod: null },
    };
    const repo = {
      findOne: jest.fn(async ({ where }) => { const s = sales[where.strId]; return s && s.strTenantId === where.strTenantId ? s : null; }),
      save: jest.fn(async (s) => s),
    };
    upload = jest.fn(async () => ({ secure_url: 'https://res.cloudinary.com/x/volante.jpg' }));
    service = new SalePaymentProofService(repo as any, { uploadImageFromBuffer: upload } as any);
  });

  it('guarda la foto del volante y el N° de aprobación', async () => {
    const s = await service.attach('t1', 'tarjeta', img(), '  APROB 123456  ');
    expect(upload).toHaveBeenCalledWith(expect.any(Buffer), 'inout/sale-payment-proofs', 't1');
    expect(s).toMatchObject({ strPaymentProofUrl: 'https://res.cloudinary.com/x/volante.jpg', strPaymentReference: 'APROB 123456' });
  });

  it('solo la referencia, sin foto, también sirve', async () => {
    const s = await service.attach('t1', 'tarjeta', undefined, '998877');
    expect(upload).not.toHaveBeenCalled();
    expect(s.strPaymentReference).toBe('998877');
  });

  it('no aplica a efectivo ni a crédito', async () => {
    await expect(service.attach('t1', 'efectivo', img(), '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attach('t1', 'credito', img(), '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('valida el archivo, que haya algo y que la venta sea del negocio', async () => {
    await expect(service.attach('t1', 'tarjeta', img({ mimetype: 'application/pdf' }), '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attach('t1', 'tarjeta', img({ size: 6 * 1024 * 1024 }), '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attach('t1', 'tarjeta', undefined, '  ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attach('otro', 'tarjeta', img(), '')).rejects.toBeInstanceOf(NotFoundException);
    expect(upload).not.toHaveBeenCalled();
  });
});

import { CreditVouchersService } from './credit-vouchers.service';

/** Servicio con dependencias en memoria: una cuenta abierta que debe $12.000. */
function crear(opts: { status?: string; totalDue?: number; pending?: number[] } = {}) {
  const rows: any[] = (opts.pending || []).map((amount, i) => ({ id: `v${i}`, tenantId: 't1', receivableId: 'r1', amount, status: 'PENDIENTE_VERIFICACION' }));
  const voucherRepo = {
    rows,
    find: jest.fn(async ({ where }) => rows.filter((v) => Object.entries(where).every(([k, val]) => v[k] === val))),
    findOne: jest.fn(async ({ where }) => rows.find((v) => v.id === where.id && v.tenantId === where.tenantId) || null),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => { if (!x.id) { x.id = `v${rows.length}`; rows.push(x); } return x; }),
  };
  const entity = { id: 'r1', tenantId: 't1', status: opts.status || 'PENDIENTE' };
  const creditService = {
    findByPayToken: jest.fn(async () => ({ entity, view: { totalDue: opts.totalDue ?? 12000 } })),
    registerPayment: jest.fn(async () => ({ paymentId: 'pay-1' })),
  };
  const cloudinary = { uploadImageFromBuffer: jest.fn(async () => ({ secure_url: 'https://res.cloudinary.com/x/comprobante.jpg' })) };
  const service = new CreditVouchersService(voucherRepo as any, {} as any, creditService as any, {} as any, cloudinary as any, {} as any);
  return { service, voucherRepo, creditService, cloudinary };
}

const foto = { mimetype: 'image/jpeg', size: 200_000, buffer: Buffer.from('x') } as any;

describe('pago de cartera desde el enlace del recordatorio', () => {
  it('el comprobante queda por verificar', async () => {
    const { service, voucherRepo } = crear();
    const r = await service.submit('token-valido-de-prueba-123', { amount: '12000', method: 'NEQUI', reference: 'M123' }, foto);
    expect(r).toMatchObject({ amount: 12000, status: 'PENDIENTE_VERIFICACION' });
    expect(voucherRepo.rows[0]).toMatchObject({ voucherUrl: 'https://res.cloudinary.com/x/comprobante.jpg', reference: 'M123', tenantId: 't1' });
  });

  it('no acepta más de lo que se debe, contando los comprobantes pendientes', async () => {
    const { service } = crear({ pending: [10000] });
    await expect(service.submit('token-valido-de-prueba-123', { amount: 5000, method: 'NEQUI' }, foto)).rejects.toThrow('Ya hay comprobantes por verificar');
  });

  it('exige una imagen y un medio de pago válido', async () => {
    const { service } = crear();
    await expect(service.submit('token-valido-de-prueba-123', { amount: 1000, method: 'NEQUI' }, undefined)).rejects.toThrow('Adjunta la foto');
    await expect(service.submit('token-valido-de-prueba-123', { amount: 1000, method: 'NEQUI' }, { ...foto, mimetype: 'application/pdf' })).rejects.toThrow('JPG, PNG o WEBP');
    await expect(service.submit('token-valido-de-prueba-123', { amount: 1000, method: 'EFECTIVO' }, foto)).rejects.toThrow('Medio de pago');
  });

  it('una cuenta pagada no recibe comprobantes', async () => {
    const { service } = crear({ status: 'PAGADA' });
    await expect(service.submit('token-valido-de-prueba-123', { amount: 1000, method: 'NEQUI' }, foto)).rejects.toThrow('ya no tiene saldo');
  });

  it('al verificar se registra el abono en Cartera', async () => {
    const { service, creditService } = crear({ pending: [12000] });
    const v = await service.review('t1', { id: 'u1', email: 'admin@tienda.co' }, 'v0', 'VERIFY');
    expect(creditService.registerPayment).toHaveBeenCalledWith('t1', expect.anything(), 'r1', expect.objectContaining({ amount: 12000 }));
    expect(v).toMatchObject({ status: 'VERIFICADO', paymentId: 'pay-1', reviewedBy: 'admin@tienda.co' });
  });

  it('rechazar pide el motivo y no registra abono', async () => {
    const { service, creditService } = crear({ pending: [12000] });
    await expect(service.review('t1', { id: 'u1', email: null } as any, 'v0', 'REJECT', 'no')).rejects.toThrow('motivo');
    const v = await service.review('t1', { id: 'u1', email: null } as any, 'v0', 'REJECT', 'El valor no coincide');
    expect(v).toMatchObject({ status: 'RECHAZADO', rejectReason: 'El valor no coincide' });
    expect(creditService.registerPayment).not.toHaveBeenCalled();
  });
});

import { BadRequestException } from '@nestjs/common';
import { TenantBrandingService } from './tenant-branding.service';

/** Nota al pie del comprobante de venta. */
describe('TenantBrandingService.setReceiptNote', () => {
  let rows: any[];
  let service: TenantBrandingService;
  beforeEach(() => {
    rows = [];
    const repo = {
      findOne: jest.fn(async ({ where }) => rows.find((r) => r.tenantId === where.tenantId) || null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => { const i = rows.indexOf(x); if (i < 0) rows.push(x); return x; }),
    };
    service = new TenantBrandingService(repo as any, {} as any);
  });

  it('guarda la nota limpia y la devuelve en la vista', async () => {
    const v = await service.setReceiptNote('t1', '  El domicilio se acuerda\r\n\r\n\r\n\r\ncon el domiciliario  ');
    expect(v.receiptNote).toBe('El domicilio se acuerda\n\ncon el domiciliario');
    expect((await service.get('t1')).receiptNote).toBe('El domicilio se acuerda\n\ncon el domiciliario');
  });

  it('vacía = sin nota', async () => {
    await service.setReceiptNote('t1', 'Algo');
    expect((await service.setReceiptNote('t1', '   ')).receiptNote).toBeNull();
  });

  it('máximo 300 caracteres', async () => {
    await expect(service.setReceiptNote('t1', 'x'.repeat(301))).rejects.toBeInstanceOf(BadRequestException);
  });
});

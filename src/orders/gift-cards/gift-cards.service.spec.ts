import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GiftCardsService } from './gift-cards.service';

/** Repositorio en memoria (solo lo que usa el servicio en estas reglas). */
function fakeRepo(rows: any[]) {
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]: [string, any]) => (v?._type === 'in' ? v._value.includes(row[k]) : row[k] === v));
  const manager: any = {
    save: async (entity: any, obj?: any) => obj ?? entity,
    create: (_e: any, obj: any) => obj,
    find: async (_e: any, opts: any) => rows.filter((r) => matches(r, opts.where)),
    findOne: async (_e: any, opts: any) => rows.find((r) => matches(r, opts.where)) || null,
  };
  return {
    manager,
    findOne: async (opts: any) => rows.find((r) => matches(r, opts.where)) || null,
    save: async (r: any) => r,
  };
}

const T = 'tenant-1';
const card = (over: any = {}) => ({
  id: 'c1', tenantId: T, code: 'BONO-7K3M-Q9XF-2HTR', amount: 50000, balance: 50000, status: 'ACTIVO',
  recipientUserId: null, recipientEmail: null, expiresAt: new Date(Date.now() + 86400000), ...over,
});

function service(rows: any[]) {
  const repo = fakeRepo(rows);
  const svc = new GiftCardsService(repo as any, repo as any, {} as any);
  return { svc, manager: repo.manager };
}

describe('GiftCardsService: reclamar y usar bonos', () => {
  it('reclamar con el código deja el bono en la cuenta', async () => {
    const c = card();
    const { svc } = service([c]);
    const view = await svc.claim(T, { id: 'u1', email: 'ana@x.co' }, 'bono 7k3m q9xf 2htr');
    expect(view.balance).toBe(50000);
    expect(c.recipientUserId).toBe('u1');
  });

  it('código inexistente u otra tienda → no encontrado', async () => {
    const { svc } = service([card()]);
    await expect(svc.claim('otra', { id: 'u1' }, 'BONO-7K3M-Q9XF-2HTR')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.claim(T, { id: 'u1' }, 'BONO-AAAA-BBBB-CCCC')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un bono de otra cuenta o enviado a otro correo no se puede tomar', async () => {
    const { svc } = service([card({ recipientUserId: 'u2' })]);
    await expect(svc.claim(T, { id: 'u1' }, 'BONO-7K3M-Q9XF-2HTR')).rejects.toBeInstanceOf(ForbiddenException);
    const { svc: svc2 } = service([card({ recipientEmail: 'laura@x.co' })]);
    await expect(svc2.claim(T, { id: 'u1', email: 'ana@x.co' }, 'BONO-7K3M-Q9XF-2HTR')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc2.claim(T, { id: 'u3', email: 'LAURA@x.co'.toLowerCase() }, 'BONO-7K3M-Q9XF-2HTR')).resolves.toBeTruthy();
  });

  it('un bono sin activar o anulado no se reclama', async () => {
    const { svc } = service([card({ status: 'PENDIENTE' })]);
    await expect(svc.claim(T, { id: 'u1' }, 'BONO-7K3M-Q9XF-2HTR')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('para pagar: solo bonos activos, vigentes, con saldo y de la cuenta', async () => {
    const rows = [card(), card({ id: 'c2', code: 'BONO-2222-2222-2222', expiresAt: new Date(Date.now() - 1000) })];
    const { svc, manager } = service(rows);
    await expect(svc.lockForRedemption(manager, T, { id: 'u1' }, ['c1'])).resolves.toHaveLength(1);
    await expect(svc.lockForRedemption(manager, T, { id: 'u1' }, ['c2'])).rejects.toThrow('vencido');
    await expect(svc.lockForRedemption(manager, T, { id: 'u1' }, ['nope'])).rejects.toThrow('no existe');
  });
});

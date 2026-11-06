import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BarcodesService } from './barcodes.service';
import { normalizeCode, normalizeCodes } from './barcode-codes';
import { ItemBarcode } from './entities/item-barcode.entity';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { Combo } from '../combos/entities/combo.entity';

describe('normalizeCode', () => {
  it('limpia lo que entrega el lector', () => {
    expect(normalizeCode(' 7702004003508\r\n')).toBe('7702004003508');
    expect(normalizeCode('ABC-M-00001')).toBe('ABC-M-00001');
  });
  it('rechaza códigos muy cortos, muy largos o con caracteres raros', () => {
    expect(normalizeCode('12')).toBeNull();
    expect(normalizeCode('9'.repeat(65))).toBeNull();
    expect(normalizeCode('77020ñ')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
  it('quita repetidos y reporta el primero inválido', () => {
    expect(normalizeCodes(['111', ' 111', '222'])).toEqual({ codes: ['111', '222'], invalid: null });
    expect(normalizeCodes(['111', 'x'])).toEqual({ codes: [], invalid: 'x' });
  });
});

describe('BarcodesService', () => {
  const T = 'tenant-1';
  const P1 = '11111111-1111-4111-8111-111111111111';
  const P2 = '22222222-2222-4222-8222-222222222222';
  const MAT = '33333333-3333-4333-8333-333333333333';

  let rows: ItemBarcode[];
  let items: Map<any, any[]>;
  let service: BarcodesService;

  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && '_type' in v) {
      if (v._type === 'in') return v._value.includes(row[k]);
      if (v._type === 'not') return row[k] !== v._value;
      if (v._type === 'isNull') return row[k] == null;
    }
    return row[k] === v;
  });

  const repo: any = {
    find: async ({ where }: any) => rows.filter((r) => matches(r, where)),
    findOne: async ({ where }: any) => rows.find((r) => matches(r, where)) || null,
    delete: async (ids: string[]) => { rows = rows.filter((r) => !ids.includes(r.strId)); },
    create: (r: any) => ({ ...r }),
    save: async (list: any[]) => { list.forEach((r, i) => rows.push({ ...r, strId: `n${rows.length + i}`, dtmCreationDate: new Date() })); return list; },
  };

  beforeEach(() => {
    rows = [];
    items = new Map<any, any[]>([
      [Product, [{ strId: P1, strTenantId: T, strName: 'Gaseosa 400 ml' }, { strId: P2, strTenantId: T, strName: 'Gaseosa 1,5 L' }]],
      [Material, [{ strId: MAT, strTenantId: T, strName: 'Bolsa de hielo', dtmDeletedAt: null }]],
      [MaterialT, []],
      [Combo, []],
    ]);
    const dataSource: any = {
      manager: { findOne: async (entity: any, { where }: any) => (items.get(entity) || []).find((r) => matches(r, where)) || null },
      transaction: async (cb: any) => cb({ getRepository: () => repo }),
    };
    service = new BarcodesService(repo, dataSource);
  });

  it('un producto puede tener varios códigos', async () => {
    await service.setForItem(T, 'product', P1, ['7702004003508', '7702004003515']);
    expect(await service.findForItem(T, 'product', P1)).toEqual(['7702004003508', '7702004003515']);
    expect(await service.findAll(T)).toHaveLength(2);
  });

  it('reemplaza los códigos: quita los que ya no están', async () => {
    await service.setForItem(T, 'product', P1, ['111', '222']);
    await service.setForItem(T, 'product', P1, ['222', '333']);
    expect((await service.findForItem(T, 'product', P1)).sort()).toEqual(['222', '333']);
  });

  it('no deja asignar un código que ya es de otro ítem, y dice de cuál', async () => {
    await service.setForItem(T, 'product', P1, ['111']);
    await expect(service.setForItem(T, 'product', P2, ['111'])).rejects.toThrow(new ConflictException('El código 111 ya es de «Gaseosa 400 ml».'));
    expect(await service.findForItem(T, 'product', P1)).toEqual(['111']);
  });

  it('si el material dueño del código se eliminó, el código pasa al nuevo ítem', async () => {
    await service.setForItem(T, 'material', MAT, ['555']);
    items.get(Material)![0].dtmDeletedAt = new Date();
    await service.setForItem(T, 'product', P1, ['555']);
    expect((await service.lookup(T, '555')).itemId).toBe(P1);
  });

  it('busca el dueño de un código con su nombre', async () => {
    await service.setForItem(T, 'material', MAT, ['7701234567890']);
    expect(await service.lookup(T, ' 7701234567890 ')).toEqual({ code: '7701234567890', itemType: 'material', itemId: MAT, itemName: 'Bolsa de hielo' });
    await expect(service.lookup(T, '000000')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('valida el tipo, el ítem y los códigos', async () => {
    await expect(service.setForItem(T, 'cliente', P1, ['111'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setForItem(T, 'product', MAT, ['111'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setForItem('otro-tenant', 'product', P1, ['111'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setForItem(T, 'product', P1, ['1'])).rejects.toBeInstanceOf(BadRequestException);
  });
});

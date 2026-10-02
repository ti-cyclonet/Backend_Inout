import { BadRequestException } from '@nestjs/common';
import { reservedLines, reserveManufactured, reserveOrderStock } from './order-stock';

/**
 * EntityManager falso: findOne devuelve productos/materiales de un mapa y
 * query() acumula los UPDATE de stock para poder verificar qué se reservó.
 */
function fakeManager(rows: Record<string, any>) {
  const updates: { base: number; id: string; sql: string }[] = [];
  const manager: any = {
    findOne: async (_entity: any, opts: any) => rows[opts.where.strId] || null,
    query: async (sql: string, params: any[]) => {
      updates.push({ sql, base: params[0], id: params[1] });
      const row = rows[params[1]];
      if (row && sql.includes('"ingReservedStock" = COALESCE("ingReservedStock", 0) +')) {
        row.ingReservedStock = Number(row.ingReservedStock || 0) + params[0];
      }
    },
  };
  return { manager, updates };
}

const item = (productId: string, quantity: number, extra: any = {}) => ({
  productId, productName: productId, quantity, unitPrice: 10, subtotal: 10 * quantity, ...extra,
});

describe('reserveOrderStock', () => {
  it('con stock suficiente reserva todo y no deja nada por fabricar', async () => {
    const { manager, updates } = fakeManager({ p1: { strId: 'p1', strName: 'Mesa', ingQuantity: 5, ingReservedStock: 0 } });
    const r = await reserveOrderStock(manager, 't1', [item('p1', 3)]);
    expect(r.items[0]).toMatchObject({ reservedQuantity: 3, toManufacture: 0 });
    expect(r.hasMadeToOrder).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0].base).toBe(3);
  });

  it('producto bajo pedido sin stock suficiente: reserva lo disponible y el resto queda por fabricar', async () => {
    const { manager, updates } = fakeManager({
      p1: { strId: 'p1', strName: 'Mesa', ingQuantity: 3, ingReservedStock: 1, blnMadeToOrder: true, intProductionLeadHours: 48 },
    });
    const r = await reserveOrderStock(manager, 't1', [item('p1', 5)]);
    expect(r.items[0]).toMatchObject({ reservedQuantity: 2, toManufacture: 3 });
    expect(r.hasMadeToOrder).toBe(true);
    expect(r.maxLeadHours).toBe(48);
    expect(updates[0].base).toBe(2);
  });

  it('bajo pedido sin nada de stock: no reserva y todo queda por fabricar', async () => {
    const { manager, updates } = fakeManager({ p1: { strId: 'p1', strName: 'Torta', ingQuantity: 0, ingReservedStock: 0, blnMadeToOrder: true } });
    const r = await reserveOrderStock(manager, 't1', [item('p1', 2)]);
    expect(r.items[0]).toMatchObject({ reservedQuantity: 0, toManufacture: 2 });
    expect(updates).toHaveLength(0);
  });

  it('el mismo producto en dos líneas comparte el disponible', async () => {
    const { manager } = fakeManager({ p1: { strId: 'p1', strName: 'Mesa', ingQuantity: 4, ingReservedStock: 0, blnMadeToOrder: true } });
    const r = await reserveOrderStock(manager, 't1', [item('p1', 3), item('p1', 3)]);
    expect(r.items[0]).toMatchObject({ reservedQuantity: 3, toManufacture: 0 });
    expect(r.items[1]).toMatchObject({ reservedQuantity: 1, toManufacture: 2 });
  });

  it('producto normal sin stock sigue siendo un error', async () => {
    const { manager } = fakeManager({ p1: { strId: 'p1', strName: 'Silla', ingQuantity: 1, ingReservedStock: 0 } });
    await expect(reserveOrderStock(manager, 't1', [item('p1', 2)])).rejects.toThrow(BadRequestException);
  });
});

describe('reservedLines', () => {
  it('pedidos anteriores sin los campos nuevos se consideran totalmente reservados', () => {
    const lines = reservedLines([item('p1', 4) as any, item('p2', 3, { reservedQuantity: 1, toManufacture: 2 }) as any]);
    expect(lines.map((l) => l.quantity)).toEqual([4, 1]);
  });

  it('omite líneas sin nada reservado', () => {
    expect(reservedLines([item('p1', 2, { reservedQuantity: 0, toManufacture: 2 }) as any])).toHaveLength(0);
  });
});

describe('reserveManufactured', () => {
  it('al pasar a listo reserva lo fabricado y completa la línea', async () => {
    const { manager, updates } = fakeManager({ p1: { strId: 'p1', strName: 'Mesa', ingQuantity: 5, ingReservedStock: 2 } });
    const items = await reserveManufactured(manager, 't1', [item('p1', 5, { reservedQuantity: 2, toManufacture: 3 })]);
    expect(items[0]).toMatchObject({ reservedQuantity: 5, toManufacture: 0 });
    expect(updates[0].base).toBe(3);
  });

  it('si aún no se fabricó, explica que falta registrar la producción', async () => {
    const { manager } = fakeManager({ p1: { strId: 'p1', strName: 'Mesa', ingQuantity: 2, ingReservedStock: 2 } });
    await expect(reserveManufactured(manager, 't1', [item('p1', 5, { reservedQuantity: 2, toManufacture: 3 })]))
      .rejects.toThrow(/Registra la producción/);
  });
});

describe('reserveOrderStock · kits armados bajo pedido', () => {
  /** Kit sin armados + sus componentes (productos) en el mismo mapa; find() devuelve los componentes. */
  function kitManager(components: { id: string; mto: boolean; lead?: number }[]) {
    const rows: Record<string, any> = {
      k1: { strId: 'k1', strName: 'Uniforme completo', strType: 'KIT', strStatus: 'active', ingQuantity: 0, ingReservedStock: 0 },
    };
    for (const c of components) {
      rows[c.id] = { strId: c.id, strName: c.id, ingQuantity: 0, ingReservedStock: 0, fltPrice: 10, fltCost: 5, blnMadeToOrder: c.mto, intProductionLeadHours: c.lead || 0 };
    }
    const { manager, updates } = fakeManager(rows);
    manager.find = async () => components.map((c) => ({ strComboId: 'k1', strItemType: 'product', strItemId: c.id, fltQuantity: 1, strQuantityMode: 'SALE' }));
    return { manager, updates };
  }

  it('todos los componentes bajo pedido: el kit se puede pedir y queda por fabricar', async () => {
    const { manager, updates } = kitManager([{ id: 'blusa', mto: true, lead: 72 }, { id: 'falda', mto: true, lead: 48 }]);
    const r = await reserveOrderStock(manager, 't1', [item('k1', 2, { itemType: 'kit' })]);
    expect(r.items[0]).toMatchObject({ reservedQuantity: 0, toManufacture: 2 });
    expect(r.hasMadeToOrder).toBe(true);
    expect(r.maxLeadHours).toBe(72);
    expect(updates).toHaveLength(0);
  });

  it('si algún componente no es bajo pedido, el kit sigue exigiendo armados', async () => {
    const { manager } = kitManager([{ id: 'blusa', mto: true }, { id: 'medias', mto: false }]);
    await expect(reserveOrderStock(manager, 't1', [item('k1', 1, { itemType: 'kit' })])).rejects.toThrow(/Stock insuficiente/);
  });
});

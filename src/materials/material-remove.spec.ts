import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaterialsService } from './material.service';

/** MaterialsService con solo lo que usa remove: repositorio, consulta de usos y contador. */
function setup(material: any, usages: string[] = []) {
  const updates: any[] = [];
  const repo: any = {
    findOne: async () => material,
    update: async (where: any, data: any) => { updates.push({ where, data }); },
  };
  const activities: any[] = [];
  const activityRepo: any = { save: async (a: any) => activities.push(a) };
  const dataSource: any = { query: jest.fn(async () => usages.map((name) => ({ name }))) };
  const limits = { decrement: jest.fn(async () => undefined) };
  const service = new MaterialsService(repo, null as any, activityRepo, dataSource, null as any, null as any, limits as any);
  return { service, updates, activities, limits, dataSource };
}

const queso = () => ({
  strId: '0d7c1a52-6d0e-4a59-9a8e-2f8d7f1b3c11', strTenantId: 't1', strName: 'QUESO MOZARELLA', strUnitMeasure: 'g',
  ingQuantity: '0.00', ingReservedStock: '0.00', dtmDeletedAt: null,
});

describe('MaterialsService.remove', () => {
  it('marca el material como eliminado sin borrar la fila y lo saca de ventas y catálogo', async () => {
    const { service, updates, activities, limits } = setup(queso());
    const r = await service.remove(queso().strId, 't1');

    expect(updates).toHaveLength(1);
    expect(updates[0].where).toEqual({ strId: queso().strId, strTenantId: 't1' });
    expect(updates[0].data).toMatchObject({ strStatus: 'Inactive', blnForResale: false, blnMarketplaceVisible: false });
    expect(updates[0].data.dtmDeletedAt).toBeInstanceOf(Date);
    expect(limits.decrement).toHaveBeenCalledWith('t1', 'nMateriales');
    expect(activities[0]).toMatchObject({ strType: 'material_deleted', strEntityId: queso().strId });
    expect(r.message).toContain('historial se conserva');
  });

  it('no elimina un material con stock o con stock reservado', async () => {
    await expect(setup({ ...queso(), ingQuantity: '250.00' }).service.remove(queso().strId, 't1'))
      .rejects.toThrow(/en stock/);
    await expect(setup({ ...queso(), ingReservedStock: '100.00' }).service.remove(queso().strId, 't1'))
      .rejects.toThrow(/reservados/);
  });

  it('no elimina un material que usa una receta o un combo, y dice cuáles', async () => {
    const { service, updates } = setup(queso(), ['el combo Combo familiar', 'el producto AREPA DE QUESO']);
    await expect(service.remove(queso().strId, 't1')).rejects.toThrow(BadRequestException);
    await expect(service.remove(queso().strId, 't1')).rejects.toThrow(/el combo Combo familiar, el producto AREPA DE QUESO/);
    expect(updates).toHaveLength(0);
  });

  it('un material ya eliminado no se vuelve a eliminar', async () => {
    const { service, limits } = setup({ ...queso(), dtmDeletedAt: new Date() });
    await expect(service.remove(queso().strId, 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(limits.decrement).not.toHaveBeenCalled();
  });
});

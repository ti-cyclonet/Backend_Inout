import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMarketplaceConfigDto } from './update-marketplace-config.dto';

const errores = (displayMode: string) =>
  validateSync(plainToInstance(UpdateMarketplaceConfigDto, { tenantId: 't', selectedProductIds: [], displayMode }));

describe('UpdateMarketplaceConfigDto.displayMode', () => {
  it.each(['grid', 'grid-fresh', 'grid-chic', 'menu', 'menu-chalk', 'menu-clean'])('acepta %s', (modo) => {
    expect(errores(modo)).toEqual([]);
  });

  it('rechaza un modo desconocido', () => {
    expect(errores('grid-neon').length).toBe(1);
  });

  it('cada modo cabe en la columna displayMode (varchar 10)', () => {
    for (const m of ['grid', 'grid-fresh', 'grid-chic', 'menu', 'menu-chalk', 'menu-clean']) expect(m.length).toBeLessThanOrEqual(10);
  });
});

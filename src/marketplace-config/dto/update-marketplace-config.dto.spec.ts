import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMarketplaceConfigDto } from './update-marketplace-config.dto';

const errores = (displayMode: string) =>
  validateSync(plainToInstance(UpdateMarketplaceConfigDto, { tenantId: 't', selectedProductIds: [], displayMode }));

describe('UpdateMarketplaceConfigDto.displayMode', () => {
  it.each(['grid', 'grid-fresh', 'grid-boutique', 'menu', 'menu-chalk', 'menu-clean'])('acepta %s', (modo) => {
    expect(errores(modo)).toEqual([]);
  });

  it('rechaza un modo desconocido', () => {
    expect(errores('grid-neon').length).toBe(1);
  });
});

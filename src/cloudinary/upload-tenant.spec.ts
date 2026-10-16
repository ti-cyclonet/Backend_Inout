import { uploadTenant } from './cloudinary.service';

describe('uploadTenant', () => {
  const id = '0b858aa7-e5f8-4de9-b732-2a482c8679fa';

  it('usa el cliente indicado', () => {
    expect(uploadTenant('InOut/products', id)).toBe(id);
  });

  it('lo toma de la carpeta del cliente', () => {
    expect(uploadTenant(`inout/tenants/${id}/menu`)).toBe(id);
    expect(uploadTenant(`staging/inout/tenants/${id}`)).toBe(id);
  });

  it('sin cliente: null (consumo compartido)', () => {
    expect(uploadTenant('/InOut/materials/')).toBeNull();
    expect(uploadTenant('inout/tenants/t1/menu')).toBeNull();
  });
});

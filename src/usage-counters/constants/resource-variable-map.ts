/**
 * Mapeo estático de variables de límite a recursos controlados.
 * Las variables de InOut están predefinidas en código (enfoque estático).
 */

/** Variable name → resource identifier */
export const VARIABLE_RESOURCE_MAP: Record<string, string> = {
  nAdmin: 'admin-accounts',
  nMateriales: 'materials',
  nMaterialesT: 'materials-t',
  nProductos: 'products',
  nLotes: 'product-productions',
  nClientes: 'customers',
  nVentas: 'sales',
  nSesionesCap: 'training-sessions',
  nProveedores: 'suppliers',
};

/** Resource identifier → variable name */
export const RESOURCE_VARIABLE_MAP: Record<string, string> = {
  'admin-accounts': 'nAdmin',
  'materials': 'nMateriales',
  'materials-t': 'nMaterialesT',
  'products': 'nProductos',
  'product-productions': 'nLotes',
  'customers': 'nClientes',
  'sales': 'nVentas',
  'training-sessions': 'nSesionesCap',
  'suppliers': 'nProveedores',
};

/** Display names for each variable */
export const VARIABLE_DISPLAY_NAMES: Record<string, string> = {
  nAdmin: 'Cuentas Administrador',
  nMateriales: 'Materiales',
  nMaterialesT: 'Materiales Compuestos',
  nProductos: 'Productos',
  nLotes: 'Lotes de Producción',
  nClientes: 'Clientes',
  nVentas: 'Ventas',
  nSesionesCap: 'Sesiones de Capacitación',
  nProveedores: 'Proveedores',
};

/** All known variable names */
export const ALL_VARIABLE_NAMES = Object.keys(VARIABLE_RESOURCE_MAP);

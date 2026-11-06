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
  nPedidos: 'orders',
  nSesionesCap: 'training-sessions',
  nProveedores: 'suppliers',
  nBodegas: 'warehouses',
  nCorreos: 'emails',
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
  'orders': 'nPedidos',
  'training-sessions': 'nSesionesCap',
  'suppliers': 'nProveedores',
  'warehouses': 'nBodegas',
  'emails': 'nCorreos',
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
  nPedidos: 'Pedidos',
  nSesionesCap: 'Sesiones de Capacitación',
  nProveedores: 'Proveedores',
  nBodegas: 'Bodegas',
  nCorreos: 'Correos enviados',
};

/**
 * Funciones del plan (limitType «feature»): encendidas con maxValue 1. Si el
 * paquete no define la variable, la función está disponible (los paquetes
 * anteriores no las traen).
 */
export const FEATURE_LABELS: Record<string, string> = {
  fTiendaOnline: 'la tienda online',
  fCredito: 'las ventas a crédito',
  fCombosPromos: 'los combos, promociones y bonos de regalo',
};

/** All known variable names */
export const ALL_VARIABLE_NAMES = Object.keys(VARIABLE_RESOURCE_MAP);

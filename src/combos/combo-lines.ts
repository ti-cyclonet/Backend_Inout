import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { Combo } from './entities/combo.entity';
import { loadComponents, assertSellableComponents } from './combo-components';
import { prorate } from './combo-math';

/** Datos del combo que viajan en cada línea de componente de un pedido/venta. */
export interface ComboLineInfo {
  /** Agrupa las líneas de UNA unidad/línea de combo del pedido. */
  groupId: string;
  comboId: string;
  comboName: string;
  comboQuantity: number;
  comboUnitPrice: number;
  /** Precio normal del combo (sin promoción). */
  comboListPrice?: number;
  /** Promoción aplicada al combo (foto al momento de la venta). */
  promotion?: any;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Expande las líneas de COMBO VIRTUAL (itemType 'combo') de un pedido/venta
 * en sus componentes, que quedan como líneas normales (producto o material
 * de reventa) con el precio del combo prorrateado y la marca `combo`.
 *
 * Así todo el flujo de stock (reservas, fabricación bajo pedido, Kardex,
 * reportes por producto) funciona sin cambios, y la interfaz agrupa las
 * líneas por `combo.groupId` para mostrarlas como un solo combo.
 *
 * El precio del combo sale de la base de datos, no del cliente: o el que
 * dejó PricingService en `serverUnitPrice` (con la promoción aplicada), o el
 * precio del combo. Las demás líneas pasan tal cual; las ya expandidas
 * (traen `combo`) también.
 */
export async function expandComboLines<T extends { productId: string; quantity: number; itemType?: string }>(
  manager: EntityManager,
  tenantId: string,
  items: T[] | null | undefined,
): Promise<any[]> {
  if (!Array.isArray(items)) return items as any;
  if (!items.some((i) => i?.itemType === 'combo')) return items;

  const out: any[] = [];
  for (const item of items) {
    if (item?.itemType !== 'combo') {
      out.push(item);
      continue;
    }
    const comboQuantity = Number(item.quantity) || 0;
    if (comboQuantity <= 0) throw new BadRequestException('La cantidad de cada combo debe ser mayor a cero');

    const combo = await manager.findOne(Combo, {
      where: { strId: item.productId, strTenantId: tenantId },
      relations: ['components'],
    });
    if (!combo || combo.strStatus !== 'active') {
      throw new BadRequestException(`El combo ${combo?.strName ? `"${combo.strName}" ` : ''}no está disponible.`);
    }
    if (combo.strType !== 'VIRTUAL') {
      throw new BadRequestException(`"${combo.strName}" es un kit armado: se vende con su propio stock (itemType 'kit').`);
    }

    const loaded = await loadComponents(manager, tenantId, combo.components);
    assertSellableComponents(loaded);

    const listPrice = Number(combo.fltPrice) || 0;
    const server = (item as any).serverUnitPrice;
    const comboUnitPrice = typeof server === 'number' && server >= 0 ? server : listPrice;
    const info: ComboLineInfo = {
      groupId: randomUUID(),
      comboId: combo.strId,
      comboName: combo.strName,
      comboQuantity,
      comboUnitPrice,
      comboListPrice: listPrice,
      ...((item as any).promotion ? { promotion: (item as any).promotion } : {}),
    };
    const allocated = prorate(
      comboUnitPrice * comboQuantity,
      loaded.map((l) => l.facts.listPrice * l.facts.quantity),
    );

    loaded.forEach((l, i) => {
      const quantity = l.facts.quantity * comboQuantity;
      out.push({
        productId: l.entity.strId,
        productName: l.name,
        itemType: l.facts.itemType,
        quantity,
        unitPrice: quantity > 0 ? round4(allocated[i] / quantity) : 0,
        subtotal: allocated[i],
        combo: info,
      });
    });
  }
  return out;
}

export interface DisplayLine {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** Combo: lo que incluye ("2 x Hamburguesa"). */
  components?: string[];
}

const lineTotal = (it: any) =>
  Number(it?.total) || Number(it?.subtotal) || (Number(it?.quantity) || 0) * (Number(it?.unitPrice) || 0);

/**
 * Agrupa para mostrar (PDF, listados) las líneas de componentes de un combo
 * en una sola línea "Combo X" con lo que incluye; las demás pasan tal cual.
 */
export function groupComboLines(items: any[]): DisplayLine[] {
  const out: DisplayLine[] = [];
  const groups = new Map<string, DisplayLine>();
  for (const it of Array.isArray(items) ? items : []) {
    const info: ComboLineInfo | undefined = it?.combo;
    if (!info?.groupId) {
      out.push({
        name: String(it?.productName || it?.product || it?.name || 'Producto'),
        quantity: Number(it?.quantity) || 0,
        unitPrice: Number(it?.unitPrice) || 0,
        total: lineTotal(it),
      });
      continue;
    }
    let g = groups.get(info.groupId);
    if (!g) {
      g = { name: info.comboName, quantity: info.comboQuantity, unitPrice: info.comboUnitPrice, total: 0, components: [] };
      groups.set(info.groupId, g);
      out.push(g);
    }
    g.total = Math.round((g.total + lineTotal(it)) * 100) / 100;
    const perCombo = info.comboQuantity > 0 ? (Number(it.quantity) || 0) / info.comboQuantity : Number(it.quantity) || 0;
    g.components!.push(`${Math.round(perCombo * 1000) / 1000} x ${it.productName || 'Producto'}`);
  }
  return out;
}

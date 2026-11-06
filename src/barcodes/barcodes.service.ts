import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { BARCODE_ITEM_TYPES, BarcodeItemType, ItemBarcode } from './entities/item-barcode.entity';
import { MAX_CODES_PER_ITEM, normalizeCode, normalizeCodes } from './barcode-codes';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { Combo } from '../combos/entities/combo.entity';

export interface BarcodeRow {
  code: string;
  itemType: BarcodeItemType;
  itemId: string;
}

@Injectable()
export class BarcodesService {
  constructor(
    @InjectRepository(ItemBarcode) private readonly repo: Repository<ItemBarcode>,
    private readonly dataSource: DataSource,
  ) {}

  /** Todos los códigos del negocio: la venta los resuelve al instante, sin ir al servidor. */
  async findAll(tenantId: string): Promise<BarcodeRow[]> {
    const rows = await this.repo.find({ where: { strTenantId: tenantId }, order: { dtmCreationDate: 'ASC' } });
    return rows.map((r) => ({ code: r.strCode, itemType: r.strItemType, itemId: r.strItemId }));
  }

  /** ¿De quién es este código? (para avisar al asignarlo en un formulario). */
  async lookup(tenantId: string, raw: string): Promise<BarcodeRow & { itemName: string }> {
    const code = normalizeCode(raw);
    const row = code ? await this.repo.findOne({ where: { strTenantId: tenantId, strCode: code } }) : null;
    const itemName = row ? await this.itemName(tenantId, row.strItemType, row.strItemId) : null;
    if (!row || itemName === null) throw new NotFoundException('Ningún ítem tiene este código.');
    return { code: row.strCode, itemType: row.strItemType, itemId: row.strItemId, itemName };
  }

  async findForItem(tenantId: string, itemType: string, itemId: string): Promise<string[]> {
    this.checkType(itemType);
    const rows = await this.repo.find({ where: { strTenantId: tenantId, strItemId: itemId }, order: { dtmCreationDate: 'ASC' } });
    return rows.map((r) => r.strCode);
  }

  /**
   * Reemplaza los códigos de un ítem. Un código que ya es de otro ítem
   * vigente se rechaza con su nombre; si ese ítem ya no existe (o el
   * material se eliminó), el código pasa a este.
   */
  async setForItem(tenantId: string, itemType: string, itemId: string, raw: unknown): Promise<string[]> {
    this.checkType(itemType);
    const { codes, invalid } = normalizeCodes(raw);
    if (invalid !== null) throw new BadRequestException(`"${invalid}" no es un código de barras válido.`);
    if (codes.length > MAX_CODES_PER_ITEM) throw new BadRequestException(`Un ítem puede tener hasta ${MAX_CODES_PER_ITEM} códigos.`);
    if ((await this.itemName(tenantId, itemType, itemId)) === null) throw new NotFoundException('Ítem no encontrado.');

    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ItemBarcode);
      if (codes.length) {
        const taken = await repo.find({ where: { strTenantId: tenantId, strCode: In(codes), strItemId: Not(itemId) } });
        for (const other of taken) {
          const name = await this.itemName(tenantId, other.strItemType, other.strItemId);
          if (name !== null) throw new ConflictException(`El código ${other.strCode} ya es de «${name}».`);
        }
        if (taken.length) await repo.delete(taken.map((t) => t.strId));
      }
      const current = await repo.find({ where: { strTenantId: tenantId, strItemId: itemId } });
      const stale = current.filter((c) => !codes.includes(c.strCode));
      if (stale.length) await repo.delete(stale.map((c) => c.strId));
      const have = new Set(current.map((c) => c.strCode));
      const fresh = codes.filter((c) => !have.has(c));
      if (fresh.length) {
        await repo.save(fresh.map((strCode) => repo.create({ strTenantId: tenantId, strCode, strItemType: itemType as BarcodeItemType, strItemId: itemId })));
      }
      return codes;
    });
  }

  private checkType(itemType: string): asserts itemType is BarcodeItemType {
    if (!(BARCODE_ITEM_TYPES as readonly string[]).includes(itemType)) throw new BadRequestException('Tipo de ítem no válido.');
  }

  /** Nombre del ítem del negocio, o null si no existe (o el material se eliminó). */
  private async itemName(tenantId: string, itemType: BarcodeItemType, itemId: string): Promise<string | null> {
    const m = this.dataSource.manager;
    let found: { strName: string } | null = null;
    if (itemType === 'product') found = await m.findOne(Product, { where: { strId: itemId, strTenantId: tenantId }, select: ['strName'] });
    if (itemType === 'material') found = await m.findOne(Material, { where: { strId: itemId, strTenantId: tenantId, dtmDeletedAt: IsNull() }, select: ['strName'] });
    if (itemType === 'material_t') found = await m.findOne(MaterialT, { where: { strId: itemId, strTenantId: tenantId }, select: ['strName'] });
    if (itemType === 'combo') found = await m.findOne(Combo, { where: { strId: itemId, strTenantId: tenantId }, select: ['strName'] });
    return found ? found.strName : null;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Combo } from './entities/combo.entity';
import { ComboComponent } from './entities/combo-component.entity';
import { ComboAssembly } from './entities/combo-assembly.entity';
import { AssembleKitDto, ComboComponentDto, CreateComboDto, UpdateComboDto } from './dto/combo.dto';
import { assertComponentsDefinition, assertSellableComponents, COMPONENT_TABLES, LoadedComponent, loadComponents } from './combo-components';
import { kitMadeToOrder, componentsCost, listPriceTotal, stockQuantityPerCombo, virtualAvailability, weightedCost } from './combo-math';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { logoVariant } from '../tenant-branding/logo-url';

/** Imagen del combo: PNG, JPG o WebP de hasta 5 MB (la app la reduce antes de subirla). */
export const COMBO_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const COMBO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const num = (v: any) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class CombosService {
  constructor(
    @InjectRepository(Combo) private readonly comboRepo: Repository<Combo>,
    @InjectRepository(ComboAssembly) private readonly assemblyRepo: Repository<ComboAssembly>,
    private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ── Lectura ────────────────────────────────────────────────────────────

  /** Combos del tenant con precio normal, ahorro, costo, margen y disponibilidad. */
  async findAll(tenantId: string) {
    const combos = await this.comboRepo.find({
      where: { strTenantId: tenantId },
      relations: ['components'],
      order: { dtmCreationDate: 'DESC' },
    });
    const out = [];
    for (const combo of combos) out.push(await this.describe(this.dataSource.manager, tenantId, combo));
    return out;
  }

  async findOne(tenantId: string, id: string) {
    return this.describe(this.dataSource.manager, tenantId, await this.getCombo(tenantId, id));
  }

  /** Público (MarketPlace): combos activos y visibles, con lo que incluyen y el ahorro. */
  async findCatalog(tenantId: string) {
    const combos = await this.comboRepo.find({
      where: { strTenantId: tenantId, strStatus: 'active', blnMarketplaceVisible: true },
      relations: ['components'],
      order: { strName: 'ASC' },
    });
    const out = [];
    for (const combo of combos) {
      try {
        const d = await this.describe(this.dataSource.manager, tenantId, combo);
        out.push({
          strId: d.strId,
          itemType: d.strType === 'KIT' ? 'kit' : 'combo',
          strName: d.strName,
          strDescription: d.strDescription,
          strImageUrl: logoVariant(d.strImageUrl, 'web'),
          fltPrice: d.fltPrice,
          listPrice: d.listPrice,
          savings: d.savings,
          available: d.available,
          madeToOrder: d.madeToOrder,
          productionLeadHours: d.productionLeadHours,
          components: d.components.map((c) => ({ name: c.name, quantity: c.quantity, quantityMode: c.quantityMode })),
        });
      } catch {
        // Un componente borrado no debe tumbar todo el catálogo
      }
    }
    return out;
  }

  /**
   * Todo lo que se puede elegir al armar combos y promociones, en una sola
   * llamada y sin paginar: productos, materiales (de reventa o como insumo),
   * combos, kits y categorías.
   */
  async catalogOptions(tenantId: string) {
    const q = (sql: string) => this.dataSource.query(sql, [tenantId]);
    const [products, materials, materialsT, combos, categories] = await Promise.all([
      q(`SELECT "strId", "strName", "fltPrice", "fltCost", "ingQuantity", "ingReservedStock", "intCategoryId", "blnMadeToOrder", "strStatus"
         FROM manufacturing.products WHERE "strTenantId" = $1 ORDER BY "strName"`),
      q(`SELECT "strId", "strName", "strUnitMeasure", "blnForResale", "strSalePresentation", "fltPresentationQuantity", "fltSalePrice", "fltPrice", "ingQuantity", "ingReservedStock", "categoryId", "strStatus"
         FROM manufacturing.materials WHERE "strTenantId" = $1 ORDER BY "strName"`),
      q(`SELECT "strId", "strName", "strUnitMeasure", "blnForResale", "strSalePresentation", "fltPresentationQuantity", "fltSalePrice", "fltPrice", "ingQuantity", "ingReservedStock", "categoryId", "strStatus"
         FROM manufacturing."materials-t" WHERE "strTenantId" = $1 ORDER BY "strName"`),
      q(`SELECT "strId", "strName", "strType", "fltPrice", "strStatus" FROM manufacturing.combos WHERE "strTenantId" = $1 ORDER BY "strName"`),
      q(`SELECT id, name FROM manufacturing.categories WHERE "tenantId" = $1 ORDER BY name`).catch(() => []),
    ]);
    const free = (r: any) => Math.max(0, num(r.ingQuantity) - num(r.ingReservedStock));
    const material = (type: 'material' | 'material_t') => (m: any) => {
      const factor = num(m.fltPresentationQuantity);
      const resale = !!m.blnForResale && factor > 0;
      return {
        itemType: type,
        id: m.strId,
        name: m.strName,
        saleName: resale ? `${m.strName} - ${m.strSalePresentation || ''}`.trim() : null,
        unit: m.strUnitMeasure || null,
        resale,
        listPrice: resale ? num(m.fltSalePrice) : 0,
        /** Costo por unidad de medida y unidades de medida por presentación. */
        stockUnitCost: num(m.fltPrice),
        presentationFactor: resale ? factor : 1,
        /** Stock en unidad de medida y, si es de reventa, en presentaciones. */
        stock: free(m),
        saleStock: resale ? Math.floor(free(m) / factor) : null,
        categoryId: m.categoryId ?? null,
        active: m.strStatus !== 'inactive',
      };
    };
    return {
      items: [
        ...products.map((p: any) => ({
          itemType: 'product', id: p.strId, name: p.strName, saleName: p.strName, unit: 'und', resale: true,
          listPrice: num(p.fltPrice), stockUnitCost: num(p.fltCost), presentationFactor: 1,
          stock: free(p), saleStock: free(p), categoryId: p.intCategoryId ?? null,
          madeToOrder: !!p.blnMadeToOrder, active: p.strStatus !== 'inactive',
        })),
        ...materials.map(material('material')),
        ...materialsT.map(material('material_t')),
      ],
      combos: combos.map((c: any) => ({
        itemType: c.strType === 'KIT' ? 'kit' : 'combo', id: c.strId, name: c.strName, listPrice: num(c.fltPrice), active: c.strStatus === 'active',
      })),
      categories: categories.map((c: any) => ({ id: String(c.id), name: c.name })),
    };
  }

  async findAssemblies(tenantId: string, id: string) {
    await this.getCombo(tenantId, id);
    return this.assemblyRepo.find({
      where: { strTenantId: tenantId, strComboId: id },
      order: { dtmCreationDate: 'DESC' },
      take: 100,
    });
  }

  private async getCombo(tenantId: string, id: string, manager: EntityManager = this.dataSource.manager, lock = false): Promise<Combo> {
    const combo = await manager.findOne(Combo, {
      where: { strId: id, strTenantId: tenantId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!combo) throw new NotFoundException('Combo no encontrado');
    combo.components = await manager.find(ComboComponent, { where: { strComboId: combo.strId } });
    return combo;
  }

  private async describe(manager: EntityManager, tenantId: string, combo: Combo) {
    const loaded = await loadComponents(manager, tenantId, combo.components);
    const facts = loaded.map((l) => l.facts);
    const price = num(combo.fltPrice);
    const listPrice = listPriceTotal(facts);
    const isKit = combo.strType === 'KIT';
    // Costo: el del stock armado (kit) o el de los componentes hoy (virtual)
    const currentCost = componentsCost(facts);
    const cost = isKit && num(combo.ingQuantity) > 0 ? num(combo.fltCost) : currentCost;
    const available = isKit
      ? Math.max(0, num(combo.ingQuantity) - num(combo.ingReservedStock))
      : virtualAvailability(facts);
    // Cuántos kits se podrían armar con el stock actual de componentes
    const assemblable = isKit ? virtualAvailability(facts.map((f) => ({ ...f, madeToOrder: false }))) : null;
    // Kit con todos sus componentes bajo pedido: se puede pedir sin armados
    const kitMto = isKit ? kitMadeToOrder(facts) : { madeToOrder: false, leadHours: 0 };

    return {
      strId: combo.strId,
      strCode: combo.strCode,
      strName: combo.strName,
      strDescription: combo.strDescription,
      strType: combo.strType,
      strStatus: combo.strStatus,
      blnMarketplaceVisible: combo.blnMarketplaceVisible,
      strImageUrl: combo.strImageUrl,
      strImageWebUrl: logoVariant(combo.strImageUrl, 'web'),
      fltPrice: price,
      listPrice,
      savings: round2(Math.max(0, listPrice - price)),
      savingsPercent: listPrice > 0 ? round2(Math.max(0, (listPrice - price) / listPrice) * 100) : 0,
      cost,
      currentComponentsCost: currentCost,
      margin: round2(price - cost),
      marginPercent: price > 0 ? round2(((price - cost) / price) * 100) : 0,
      belowCost: price < cost,
      /** KIT: unidades armadas libres. VIRTUAL: combos vendibles con el stock (null = sin límite). */
      available,
      ingQuantity: num(combo.ingQuantity),
      ingReservedStock: num(combo.ingReservedStock),
      assemblable,
      /** KIT: se puede pedir aunque no haya armados (componentes bajo pedido). */
      madeToOrder: kitMto.madeToOrder,
      productionLeadHours: kitMto.leadHours,
      components: loaded.map((l) => ({
        strId: l.component.strId,
        itemType: l.facts.itemType,
        itemId: l.entity.strId,
        name: l.name,
        quantity: l.facts.quantity,
        quantityMode: l.facts.quantityMode,
        unitMeasure: l.entity.strUnitMeasure || null,
        listPrice: l.facts.listPrice,
        stockUnitCost: l.facts.stockUnitCost,
        presentationFactor: l.facts.presentationFactor,
        stockAvailable: l.facts.availableStock,
        madeToOrder: !!l.facts.madeToOrder,
      })),
      dtmCreationDate: combo.dtmCreationDate,
      dtmUpdateDate: combo.dtmUpdateDate,
    };
  }

  // ── Escritura ──────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateComboDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('El combo necesita un nombre.');
    assertComponentsDefinition(dto.type, dto.components);

    return this.dataSource.transaction(async (manager) => {
      const components = this.buildComponents(dto.components);
      await this.assertComponentsExist(manager, tenantId, components);

      const combo = manager.create(Combo, {
        strTenantId: tenantId,
        strCode: await this.nextCode(manager, tenantId, 'combo'),
        strName: name,
        strDescription: dto.description?.trim() || null,
        strType: dto.type,
        fltPrice: round2(dto.price),
        blnMarketplaceVisible: dto.marketplaceVisible !== false,
        strStatus: 'active',
        ingQuantity: 0,
        ingReservedStock: 0,
        fltCost: 0,
      });
      const saved = await manager.save(combo);
      for (const c of components) c.strComboId = saved.strId;
      saved.components = await manager.save(ComboComponent, components);
      return this.describe(manager, tenantId, saved);
    });
  }

  async update(tenantId: string, id: string, dto: UpdateComboDto) {
    return this.dataSource.transaction(async (manager) => {
      const combo = await this.getCombo(tenantId, id, manager, true);

      if (dto.name !== undefined) {
        if (!dto.name.trim()) throw new BadRequestException('El combo necesita un nombre.');
        combo.strName = dto.name.trim();
      }
      if (dto.description !== undefined) combo.strDescription = dto.description.trim() || null;
      if (dto.price !== undefined) combo.fltPrice = round2(dto.price);
      if (dto.marketplaceVisible !== undefined) combo.blnMarketplaceVisible = dto.marketplaceVisible;
      if (dto.status !== undefined) combo.strStatus = dto.status;

      if (dto.components) {
        assertComponentsDefinition(combo.strType, dto.components);
        // Las unidades ya armadas se hicieron con la receta anterior: cambiarla
        // dejaría el stock del kit (y su desarmado) inconsistente.
        if (combo.strType === 'KIT' && (num(combo.ingQuantity) > 0 || num(combo.ingReservedStock) > 0)) {
          throw new BadRequestException('Este kit tiene unidades armadas: desármalas antes de cambiar sus componentes.');
        }
        const components = this.buildComponents(dto.components);
        await this.assertComponentsExist(manager, tenantId, components);
        await manager.delete(ComboComponent, { strComboId: combo.strId });
        for (const c of components) c.strComboId = combo.strId;
        combo.components = await manager.save(ComboComponent, components);
      }

      const { components, ...fields } = combo;
      await manager.save(Combo, fields);
      return this.describe(manager, tenantId, combo);
    });
  }

  /**
   * Borra el combo. Un kit con unidades armadas o reservadas no se borra
   * (hay que desarmarlo). Si ya tiene historial (lotes), se desactiva en vez
   * de borrarse, para no dejar el Kardex sin referencia.
   */
  async remove(tenantId: string, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const combo = await this.getCombo(tenantId, id, manager, true);
      if (combo.strType === 'KIT' && (num(combo.ingQuantity) > 0 || num(combo.ingReservedStock) > 0)) {
        throw new BadRequestException('Este kit tiene unidades armadas o reservadas: desármalas antes de eliminarlo.');
      }
      const history = await manager.count(ComboAssembly, { where: { strTenantId: tenantId, strComboId: id } });
      if (history > 0) {
        await manager.update(Combo, { strId: id }, { strStatus: 'inactive' });
        return { deleted: false, deactivated: true, message: 'El kit tiene historial de armado: quedó inactivo en vez de eliminarse.' };
      }
      await manager.delete(Combo, { strId: id, strTenantId: tenantId });
      if (combo.strImagePublicId) {
        await this.cloudinary.destroy(combo.strImagePublicId).catch(() => undefined);
      }
      return { deleted: true, deactivated: false, message: 'Combo eliminado' };
    });
  }

  // ── Imagen ─────────────────────────────────────────────────────────────

  /** Sube o reemplaza la imagen del combo (Cloudinary); borra la anterior. */
  async setImage(tenantId: string, id: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecciona una imagen.');
    if (!COMBO_IMAGE_TYPES.includes(file.mimetype)) throw new BadRequestException('La imagen debe ser PNG, JPG o WebP.');
    if (file.size > COMBO_IMAGE_MAX_BYTES) throw new BadRequestException('La imagen no puede pesar más de 5 MB.');

    const combo = await this.getCombo(tenantId, id);
    const uploaded = await this.cloudinary.uploadImageFromBuffer(file.buffer, `inout/tenants/${tenantId}/combos`);
    const previous = combo.strImagePublicId;
    await this.comboRepo.update({ strId: id, strTenantId: tenantId }, {
      strImageUrl: uploaded.secure_url,
      strImagePublicId: uploaded.public_id,
    });
    if (previous && previous !== uploaded.public_id) await this.cloudinary.destroy(previous).catch(() => undefined);
    return this.findOne(tenantId, id);
  }

  async removeImage(tenantId: string, id: string) {
    const combo = await this.getCombo(tenantId, id);
    await this.comboRepo.update({ strId: id, strTenantId: tenantId }, { strImageUrl: null, strImagePublicId: null });
    if (combo.strImagePublicId) await this.cloudinary.destroy(combo.strImagePublicId).catch(() => undefined);
    return this.findOne(tenantId, id);
  }

  // ── Kits: armar / desarmar ─────────────────────────────────────────────

  /**
   * Arma `quantity` kits: descuenta los componentes (validando stock
   * DISPONIBLE, con las filas bloqueadas), suma al stock del kit con costo
   * promedio ponderado y registra todo en el Kardex.
   */
  async assemble(tenantId: string, id: string, dto: AssembleKitDto, actor?: string) {
    const quantity = Math.floor(num(dto.quantity));
    if (quantity < 1) throw new BadRequestException('Indica cuántos kits vas a armar.');

    return this.dataSource.transaction(async (manager) => {
      const combo = await this.getCombo(tenantId, id, manager, true);
      if (combo.strType !== 'KIT') throw new BadRequestException('Solo los kits armados tienen stock: un combo virtual se arma al venderse.');
      if (combo.strStatus !== 'active') throw new BadRequestException('El kit está inactivo.');

      const loaded = await loadComponents(manager, tenantId, combo.components, { lock: true });
      assertSellableComponents(loaded);
      const shortages = loaded
        .map((l) => ({ l, needed: stockQuantityPerCombo(l.facts) * quantity }))
        .filter(({ l, needed }) => l.facts.availableStock + 1e-9 < needed)
        .map(({ l, needed }) => `"${l.name}" (disponible: ${this.fmtQty(l, l.facts.availableStock)}, necesario: ${this.fmtQty(l, needed)})`);
      if (shortages.length) throw new BadRequestException(`Stock insuficiente para armar ${quantity} kit(s): ${shortages.join('; ')}`);

      const unitCost = componentsCost(loaded.map((l) => l.facts));
      const date = dto.date?.slice(0, 10) || today();
      const assembly = await manager.save(ComboAssembly, manager.create(ComboAssembly, {
        strTenantId: tenantId,
        strComboId: combo.strId,
        strType: 'ASSEMBLE',
        fltQuantity: quantity,
        fltUnitCost: unitCost,
        strBatchReference: await this.nextCode(manager, tenantId, 'batch'),
        dtmDate: date,
        strNotes: dto.notes?.trim() || null,
        strCreatedBy: actor || null,
      }));

      for (const l of loaded) {
        const needed = stockQuantityPerCombo(l.facts) * quantity;
        await this.moveComponent(manager, tenantId, l, -needed);
        await manager.save(InventoryMovement, {
          strTenantId: tenantId,
          ...this.movementTarget(l),
          strType: 'OUT',
          strReason: 'KIT_ASSEMBLY',
          fltQuantity: needed,
          fltUnitPrice: l.facts.stockUnitCost,
          strReferenceId: assembly.strId,
          strNotes: `Armado de kit: ${combo.strName} - Lote: ${assembly.strBatchReference}`,
          dtmDate: date as any,
        });
      }

      const newCost = weightedCost(num(combo.ingQuantity), num(combo.fltCost), quantity, unitCost);
      await manager.query(
        `UPDATE manufacturing.combos SET "ingQuantity" = COALESCE("ingQuantity", 0) + $1, "fltCost" = $2, "dtmUpdateDate" = NOW() WHERE "strId" = $3 AND "strTenantId" = $4`,
        [quantity, newCost, combo.strId, tenantId],
      );
      await manager.save(InventoryMovement, {
        strTenantId: tenantId,
        strComboId: combo.strId,
        strType: 'IN',
        strReason: 'KIT_ASSEMBLY',
        fltQuantity: quantity,
        fltUnitPrice: unitCost,
        strReferenceId: assembly.strId,
        strNotes: `Kits armados - Lote: ${assembly.strBatchReference}`,
        dtmDate: date as any,
      });

      return { message: `Se armaron ${quantity} kit(s)`, assembly, combo: await this.describe(manager, tenantId, await this.getCombo(tenantId, id, manager)) };
    });
  }

  /**
   * Desarma `quantity` kits LIBRES (no reservados por pedidos): los
   * componentes vuelven al inventario, al costo del kit en stock.
   */
  async disassemble(tenantId: string, id: string, dto: AssembleKitDto, actor?: string) {
    const quantity = Math.floor(num(dto.quantity));
    if (quantity < 1) throw new BadRequestException('Indica cuántos kits vas a desarmar.');

    return this.dataSource.transaction(async (manager) => {
      const combo = await this.getCombo(tenantId, id, manager, true);
      if (combo.strType !== 'KIT') throw new BadRequestException('Solo los kits armados se pueden desarmar.');
      const free = num(combo.ingQuantity) - num(combo.ingReservedStock);
      if (free + 1e-9 < quantity) {
        throw new BadRequestException(`Solo hay ${Math.max(0, free)} kit(s) libres para desarmar (los reservados por pedidos no se pueden desarmar).`);
      }

      const loaded = await loadComponents(manager, tenantId, combo.components, { lock: true });
      const date = dto.date?.slice(0, 10) || today();
      const assembly = await manager.save(ComboAssembly, manager.create(ComboAssembly, {
        strTenantId: tenantId,
        strComboId: combo.strId,
        strType: 'DISASSEMBLE',
        fltQuantity: quantity,
        fltUnitCost: num(combo.fltCost),
        strBatchReference: await this.nextCode(manager, tenantId, 'batch'),
        dtmDate: date,
        strNotes: dto.notes?.trim() || null,
        strCreatedBy: actor || null,
      }));

      await manager.query(
        `UPDATE manufacturing.combos SET "ingQuantity" = GREATEST(0, COALESCE("ingQuantity", 0) - $1), "dtmUpdateDate" = NOW() WHERE "strId" = $2 AND "strTenantId" = $3`,
        [quantity, combo.strId, tenantId],
      );
      await manager.save(InventoryMovement, {
        strTenantId: tenantId,
        strComboId: combo.strId,
        strType: 'OUT',
        strReason: 'KIT_DISASSEMBLY',
        fltQuantity: quantity,
        fltUnitPrice: num(combo.fltCost),
        strReferenceId: assembly.strId,
        strNotes: `Kits desarmados - Lote: ${assembly.strBatchReference}`,
        dtmDate: date as any,
      });

      for (const l of loaded) {
        const back = stockQuantityPerCombo(l.facts) * quantity;
        await this.moveComponent(manager, tenantId, l, back);
        await manager.save(InventoryMovement, {
          strTenantId: tenantId,
          ...this.movementTarget(l),
          strType: 'IN',
          strReason: 'KIT_DISASSEMBLY',
          fltQuantity: back,
          fltUnitPrice: l.facts.stockUnitCost,
          strReferenceId: assembly.strId,
          strNotes: `Desarmado de kit: ${combo.strName} - Lote: ${assembly.strBatchReference}`,
          dtmDate: date as any,
        });
      }

      return { message: `Se desarmaron ${quantity} kit(s)`, assembly, combo: await this.describe(manager, tenantId, await this.getCombo(tenantId, id, manager)) };
    });
  }

  // ── Auxiliares ─────────────────────────────────────────────────────────

  private buildComponents(dtos: ComboComponentDto[]): ComboComponent[] {
    return dtos.map((c) => Object.assign(new ComboComponent(), {
      strItemType: c.itemType,
      strItemId: c.itemId,
      fltQuantity: Math.round(num(c.quantity) * 1000) / 1000,
      strQuantityMode: c.quantityMode === 'STOCK' ? 'STOCK' : 'SALE',
    }));
  }

  private async assertComponentsExist(manager: EntityManager, tenantId: string, components: ComboComponent[]) {
    const loaded = await loadComponents(manager, tenantId, components);
    assertSellableComponents(loaded);
  }

  /** Suma (o resta) stock de un componente, en su unidad de stock. */
  private async moveComponent(manager: EntityManager, tenantId: string, l: LoadedComponent, delta: number) {
    const table = COMPONENT_TABLES[l.facts.itemType];
    const extra = l.facts.itemType === 'product' ? '' : ', "dtmUpdateDate" = NOW()';
    await manager.query(
      `UPDATE ${table} SET "ingQuantity" = GREATEST(0, COALESCE("ingQuantity", 0) + $1)${extra} WHERE "strId" = $2 AND "strTenantId" = $3`,
      [delta, l.entity.strId, tenantId],
    );
  }

  private movementTarget(l: LoadedComponent) {
    if (l.facts.itemType === 'material') return { strMaterialId: l.entity.strId };
    if (l.facts.itemType === 'material_t') return { strTransformedMaterialId: l.entity.strId };
    return { strProductId: l.entity.strId };
  }

  /** Cantidad legible en la unidad en que se definió el componente. */
  private fmtQty(l: LoadedComponent, stockQty: number): string {
    const isPresentation = l.facts.itemType !== 'product' && l.facts.quantityMode === 'SALE';
    const value = isPresentation ? stockQty / (l.facts.presentationFactor || 1) : stockQty;
    const rounded = Math.round(value * 100) / 100;
    if (l.facts.itemType === 'product') return `${rounded}`;
    return isPresentation ? `${rounded} pres.` : `${rounded} ${l.entity.strUnitMeasure || ''}`.trim();
  }

  /** CMB-00001 (combos) / KIT-00001 (lotes), consecutivo por tenant. */
  private async nextCode(manager: EntityManager, tenantId: string, kind: 'combo' | 'batch'): Promise<string> {
    const [prefix, table, column] = kind === 'combo'
      ? ['CMB', 'manufacturing.combos', '"strCode"']
      : ['KIT', 'manufacturing.combo_assemblies', '"strBatchReference"'];
    const rows = await manager.query(
      `SELECT ${column} AS code FROM ${table} WHERE "strTenantId" = $1 AND ${column} LIKE $2 ORDER BY ${column} DESC LIMIT 1`,
      [tenantId, `${prefix}-%`],
    );
    const last = parseInt(String(rows[0]?.code || '').split('-')[1] || '0', 10) || 0;
    return `${prefix}-${String(last + 1).padStart(5, '0')}`;
  }
}

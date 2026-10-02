import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import * as XLSX from 'xlsx';
import {
  ENTITY_LABELS,
  OPENING_COLUMNS,
  OPENING_REASON,
  OpeningItem,
  StockEntityType,
  parseDate,
  parseEntityType,
  parseNumber,
  todayBogota,
  validateOpening,
} from './opening-balance';

/** Tabla, columna de costo y de unidad de cada tipo de ítem con stock. */
const TABLES: Record<StockEntityType, { table: string; cost: string; unit: string; movementCol: string; updated: boolean }> = {
  material: { table: 'manufacturing.materials', cost: 'fltPrice', unit: 'strUnitMeasure', movementCol: 'strMaterialId', updated: true },
  composite: { table: 'manufacturing."materials-t"', cost: 'fltPrice', unit: 'strUnitMeasure', movementCol: 'strTransformedMaterialId', updated: true },
  // En productos fltPrice es el precio de venta: el costo es fltCost
  product: { table: 'manufacturing.products', cost: 'fltCost', unit: 'strMeasurementUnit', movementCol: 'strProductId', updated: false },
};

const ACTIVE = `COALESCE(LOWER("strStatus"), 'active') NOT IN ('inactive', 'deleted')`;

export interface OpeningResult {
  type: StockEntityType;
  id: string | null;
  code: string | null;
  name: string | null;
  ok: boolean;
  error?: string;
  /** Fila del Excel (carga masiva). */
  row?: number;
}

/**
 * Saldo inicial de inventario (ver opening-balance.ts): una entrada sin
 * documento, con costo estimado, solo en ítems sin movimientos.
 */
@Injectable()
export class OpeningBalanceService {
  constructor(private readonly dataSource: DataSource) {}

  /** ¿El ítem ya tiene movimientos (compras, producción, salidas…)? */
  private async hasMovements(manager: EntityManager, tenantId: string, type: StockEntityType, id: string): Promise<boolean> {
    const t = TABLES[type];
    const moved = await manager.query(
      `SELECT 1 FROM manufacturing.inventory_movements WHERE "strTenantId" = $1 AND "${t.movementCol}" = $2 AND "fltQuantity" > 0 LIMIT 1`,
      [tenantId, id],
    );
    if (moved.length) return true;
    if (type === 'material') {
      const bought = await manager.query(
        `SELECT 1 FROM manufacturing.purchase_records WHERE "strTenantId" = $1 AND "strMaterialId" = $2 LIMIT 1`,
        [tenantId, id],
      );
      return bought.length > 0;
    }
    if (type === 'product') {
      const produced = await manager.query(
        `SELECT 1 FROM manufacturing.product_productions WHERE "strTenantId" = $1 AND "strProductId" = $2 LIMIT 1`,
        [tenantId, id],
      );
      return produced.length > 0;
    }
    return false;
  }

  /** ¿Se le puede registrar saldo inicial a este ítem? */
  async status(tenantId: string, type: StockEntityType, id: string) {
    if (!TABLES[type]) throw new BadRequestException('Tipo de ítem no válido.');
    const rows = await this.dataSource.query(`SELECT "strId" FROM ${TABLES[type].table} WHERE "strId" = $1 AND "strTenantId" = $2`, [id, tenantId]);
    if (!rows.length) throw new NotFoundException(`${ENTITY_LABELS[type]} no encontrado.`);
    const moved = await this.hasMovements(this.dataSource.manager, tenantId, type, id);
    return moved
      ? { eligible: false, reason: 'Ya tiene movimientos: las existencias se corrigen con una compra o con un conteo físico (Inventario).' }
      : { eligible: true };
  }

  /** Registra saldos iniciales; cada ítem en su propia transacción (uno malo no frena a los demás). */
  async register(tenantId: string, items: OpeningItem[], registeredBy?: string): Promise<{ applied: number; results: OpeningResult[] }> {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('No hay saldos para registrar.');
    if (items.length > 5000) throw new BadRequestException('Máximo 5000 ítems por carga.');
    const results: OpeningResult[] = [];
    for (const raw of items) {
      const type = parseEntityType(raw?.type) || (TABLES[raw?.type as StockEntityType] ? (raw.type as StockEntityType) : null);
      const base: OpeningResult = { type: type || ('material' as StockEntityType), id: raw?.id || null, code: null, name: null, ok: false };
      if (!type || !raw?.id) { results.push({ ...base, error: 'Ítem no válido.' }); continue; }
      try {
        results.push({ ...base, ...(await this.registerOne(tenantId, { ...raw, type }, registeredBy)), ok: true });
      } catch (err: any) {
        results.push({ ...base, code: err?.code ?? null, name: err?.itemName ?? null, error: err?.message || 'No se pudo registrar.' });
      }
    }
    return { applied: results.filter((r) => r.ok).length, results };
  }

  private async registerOne(tenantId: string, item: OpeningItem, registeredBy?: string) {
    const quantity = parseNumber(item.quantity);
    const unitCost = parseNumber(item.unitCost);
    const date = parseDate(item.date);
    const error = validateOpening({ quantity, unitCost, date });
    if (error) throw new BadRequestException(error);
    const t = TABLES[item.type];

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT "strId", "strCode", "strName", "${t.unit}" AS unit FROM ${t.table} WHERE "strId" = $1 AND "strTenantId" = $2 FOR UPDATE`,
        [item.id, tenantId],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException(`${ENTITY_LABELS[item.type]} no encontrado.`);
      if (await this.hasMovements(manager, tenantId, item.type, item.id)) {
        throw Object.assign(
          new BadRequestException(`"${row.strName}" ya tiene movimientos: corrige sus existencias con una compra o con un conteo físico.`),
          { code: row.strCode, itemName: row.strName },
        );
      }

      const userNotes = (item.notes || '').toString().trim().slice(0, 120);
      const notes = `Saldo inicial (costo estimado, sin documento)${userNotes ? ` · ${userNotes}` : ''}${registeredBy ? ` · ${registeredBy}` : ''}`.slice(0, 255);
      await manager.query(
        `INSERT INTO manufacturing.inventory_movements
         ("strTenantId", "${t.movementCol}", "strType", "strReason", "fltQuantity", "fltUnitPrice", "strNotes", "dtmDate")
         VALUES ($1, $2, 'IN', $3, $4, $5, $6, $7)`,
        [tenantId, item.id, OPENING_REASON, quantity, unitCost, notes, date || todayBogota()],
      );
      // Sin movimientos previos el saldo inicial ES la existencia (no se suma a
      // un ingQuantity que no tenga respaldo en el kardex)
      await manager.query(
        `UPDATE ${t.table} SET "ingQuantity" = $1, "${t.cost}" = $2${t.updated ? ', "dtmUpdateDate" = NOW()' : ''} WHERE "strId" = $3`,
        [quantity, unitCost, item.id],
      );
      return { id: row.strId as string, code: row.strCode as string, name: row.strName as string };
    });
  }

  /** Ítems activos sin movimientos (los que aún pueden recibir saldo inicial). */
  async pendingItems(tenantId: string) {
    const out: { type: StockEntityType; id: string; code: string; name: string; unit: string }[] = [];
    for (const type of Object.keys(TABLES) as StockEntityType[]) {
      const t = TABLES[type];
      const extra =
        type === 'material'
          ? `AND NOT EXISTS (SELECT 1 FROM manufacturing.purchase_records p WHERE p."strTenantId" = i."strTenantId" AND p."strMaterialId"::text = i."strId"::text)`
          : type === 'product'
            ? `AND NOT EXISTS (SELECT 1 FROM manufacturing.product_productions p WHERE p."strTenantId" = i."strTenantId" AND p."strProductId"::text = i."strId"::text)`
            : '';
      const rows = await this.dataSource.query(
        `SELECT i."strId" AS id, i."strCode" AS code, i."strName" AS name, i."${t.unit}" AS unit
         FROM ${t.table} i
         WHERE i."strTenantId" = $1 AND ${ACTIVE.replace('"strStatus"', 'i."strStatus"')}
           AND NOT EXISTS (SELECT 1 FROM manufacturing.inventory_movements m
                           WHERE m."strTenantId" = i."strTenantId" AND m."${t.movementCol}"::text = i."strId"::text AND m."fltQuantity" > 0)
           ${extra}
         ORDER BY i."strCode"`,
        [tenantId],
      );
      rows.forEach((r: any) => out.push({ type, ...r }));
    }
    return out;
  }

  /** Plantilla de Excel con los ítems pendientes ya listados: solo se llenan cantidad y costo. */
  async template(tenantId: string): Promise<Buffer> {
    const items = await this.pendingItems(tenantId);
    const C = OPENING_COLUMNS;
    const data = items.map((i) => ({
      [C.type]: ENTITY_LABELS[i.type],
      [C.code]: i.code,
      [C.name]: i.name,
      [C.unit]: i.unit || '',
      [C.quantity]: null,
      [C.unitCost]: null,
      [C.date]: todayBogota(),
      [C.notes]: null,
    }));
    const sheet = XLSX.utils.json_to_sheet(data, { header: Object.values(C) });
    sheet['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 40 }];
    const help = XLSX.utils.aoa_to_sheet([
      ['Saldos iniciales de inventario'],
      [''],
      ['Llena Cantidad y Costo unitario de lo que tienes HOY en bodega; deja en blanco lo que no tengas.'],
      ['Cantidad: en la unidad de la columna "Unidad" (la misma del stock del ítem).'],
      ['Costo unitario: si no tienes factura, usa un costo estimado (lo que costaría comprarlo hoy o la última compra conocida).'],
      ['   Ese costo es el que InOut usa para costear la producción y los márgenes; queda marcado como "estimado".'],
      ['Fecha de corte: el día desde el que empiezas a usar InOut (AAAA-MM-DD). No puede ser futura.'],
      ['Solo aparecen los ítems sin movimientos: un saldo inicial se registra una sola vez por ítem.'],
      ['Después, las diferencias se corrigen con compras o con el conteo físico (Inventario).'],
    ]);
    help['!cols'] = [{ wch: 110 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Saldos iniciales');
    XLSX.utils.book_append_sheet(book, help, 'Instrucciones');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  }

  /** Carga masiva desde la plantilla. Las filas sin cantidad se omiten. */
  async upload(tenantId: string, file: Express.Multer.File, registeredBy?: string) {
    if (!file?.buffer) throw new BadRequestException('No se recibió el archivo.');
    let rows: any[];
    try {
      const book = XLSX.read(file.buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: null, raw: true });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo: usa la plantilla de saldos iniciales (.xlsx).');
    }
    const C = OPENING_COLUMNS;
    if (!rows.length || !(C.code in rows[0]) || !(C.quantity in rows[0])) {
      throw new BadRequestException(`El archivo no tiene las columnas de la plantilla ("${C.code}", "${C.quantity}", "${C.unitCost}"). Descarga la plantilla de saldos iniciales.`);
    }

    // Códigos del tenant → id, por tipo
    const ids = new Map<string, string>();
    for (const type of Object.keys(TABLES) as StockEntityType[]) {
      const found = await this.dataSource.query(`SELECT "strId", "strCode" FROM ${TABLES[type].table} WHERE "strTenantId" = $1`, [tenantId]);
      found.forEach((r: any) => r.strCode && ids.set(`${type}|${String(r.strCode).trim().toUpperCase()}`, r.strId));
    }

    const items: (OpeningItem & { row: number; code: string })[] = [];
    const errors: OpeningResult[] = [];
    let skipped = 0;
    rows.forEach((r, i) => {
      const row = i + 2; // fila 1 = encabezados
      const code = String(r[C.code] ?? '').trim();
      if (!code && r[C.quantity] === null) return;
      if (r[C.quantity] === null || r[C.quantity] === '') { skipped++; return; }
      const type = parseEntityType(r[C.type]);
      const fail = (error: string) => errors.push({ type: type || 'material', id: null, code: code || null, name: r[C.name] ?? null, ok: false, error, row });
      if (!type) return fail(`Tipo "${r[C.type] ?? ''}" no válido (Material, Material compuesto o Producto).`);
      const id = ids.get(`${type}|${code.toUpperCase()}`);
      if (!id) return fail(`No existe un ${ENTITY_LABELS[type].toLowerCase()} con el código "${code}".`);
      const quantity = parseNumber(r[C.quantity]);
      const unitCost = parseNumber(r[C.unitCost]);
      const date = parseDate(r[C.date]);
      const invalid = validateOpening({ quantity, unitCost, date });
      if (invalid) return fail(invalid);
      items.push({ type, id, quantity: quantity!, unitCost: unitCost!, date: date as string | null, notes: r[C.notes], row, code });
    });

    const results = items.length ? (await this.register(tenantId, items, registeredBy)).results : [];
    results.forEach((res, i) => { res.row = items[i].row; res.code = res.code || items[i].code; });
    const failed = [...errors, ...results.filter((r) => !r.ok)].sort((a, b) => (a.row || 0) - (b.row || 0));
    return { applied: results.filter((r) => r.ok).length, skipped, errors: failed };
  }
}

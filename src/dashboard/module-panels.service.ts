import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { Product } from '../products/entities/product.entity';
import { ProductProduction } from '../products/entities/product-production.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { PurchaseRecord } from '../purchases/entities/purchase-record.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { CustomersService } from '../customers/customers.service';
import { Receivable, ReceivableStatus } from '../credit/entities/receivable.entity';
import { DAY_MS, SALES_SINCE_SQL, bogotaDayStart, bogotaMonthStart, dayKey, num, saleAt, salesSinceParams } from './panel-utils';
import { ACTIVE_ORDER, SOLD_ORDER, orderSoldAt, saleTotal } from './dashboard.service';

const available = (qty: any, reserved: any) => num(qty) - num(reserved);

/** Líneas vendidas (nombre, id, cantidad, valor) de una venta o pedido. */
function soldLines(items: any, fallback?: { productId?: string; quantity?: number; total?: number }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length && fallback?.productId) return [{ id: fallback.productId, name: '', quantity: num(fallback.quantity), value: num(fallback.total) }];
  return list.map((it: any) => {
    const quantity = num(it?.quantity);
    return {
      id: String(it?.productId || ''),
      name: String(it?.productName || it?.product || it?.name || '').trim(),
      quantity,
      value: num(it?.total) || num(it?.subtotal) || quantity * num(it?.unitPrice ?? it?.price),
    };
  });
}

/**
 * Resúmenes de los paneles de cada módulo de InOut (Materiales, Productos,
 * Comercial y Clientes) para el tenant en sesión. Mismo criterio que el
 * Dashboard: indicadores con comparación, alertas accionables y rankings.
 */
@Injectable()
export class ModulePanelsService {
  constructor(
    @InjectRepository(Material) private materials: Repository<Material>,
    @InjectRepository(MaterialT) private materialsT: Repository<MaterialT>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(ProductProduction) private productions: Repository<ProductProduction>,
    @InjectRepository(InventoryMovement) private movements: Repository<InventoryMovement>,
    @InjectRepository(PurchaseRecord) private purchases: Repository<PurchaseRecord>,
    @InjectRepository(Sale) private sales: Repository<Sale>,
    @InjectRepository(Order) private orders: Repository<Order>,
    private readonly customersService: CustomersService,
    @InjectRepository(Receivable) private receivables: Repository<Receivable>,
  ) {}

  /** Ventas directas + pedidos vendidos desde `from`. */
  private async soldSince(tenantId: string, from: Date) {
    const [sales, orders] = await Promise.all([
      this.sales.createQueryBuilder('s').where('s.strTenantId = :t', { t: tenantId }).andWhere(SALES_SINCE_SQL, salesSinceParams(from)).getMany(),
      this.orders.createQueryBuilder('o').where('o.tenantId = :t', { t: tenantId })
        .andWhere('o.status IN (:...st)', { st: SOLD_ORDER })
        .andWhere('COALESCE(o.invoicedAt, o.updatedAt) >= :from', { from }).getMany(),
    ]);
    return [
      ...sales.map((s) => ({
        at: saleAt(s), total: saleTotal(s), customerId: s.strCustomerId || null, customerName: s.customerName || '',
        paymentType: (s.paymentType || 'CONTADO').toUpperCase(), paymentMethod: (s.paymentMethod || '').toUpperCase(),
        channel: 'Venta directa', lines: soldLines(s.items, { productId: s.strProductId, quantity: s.fltQuantity, total: saleTotal(s) }),
      })),
      ...orders.map((o) => ({
        at: orderSoldAt(o), total: num(o.total), customerId: o.customerId || null, customerName: (o.customerName || '').split(' | ')[0],
        paymentType: (o.paymentType || 'CONTADO').toUpperCase(), paymentMethod: (o.paymentMethod || '').toUpperCase(),
        channel: 'Pedido', lines: soldLines(o.items),
      })),
    ].filter((t) => t.at);
  }

  // ─── Materiales ────────────────────────────────────────────────────────────
  async materialsPanel(tenantId: string) {
    const now = new Date();
    const monthStart = bogotaMonthStart(now);
    const prevMonthStart = bogotaMonthStart(now, -1);
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const [materials, composites, movements, purchases, expiring] = await Promise.all([
      this.materials.find({ where: { strTenantId: tenantId } as any }),
      this.materialsT.find({ where: { strTenantId: tenantId } as any }),
      this.movements.createQueryBuilder('m').where('m.strTenantId = :t AND m.dtmCreationDate >= :from', { t: tenantId, from: since30 }).getMany(),
      this.purchases.createQueryBuilder('p').where('p.strTenantId = :t AND p.dtmCreationDate >= :from', { t: tenantId, from: prevMonthStart }).getMany(),
      this.purchases.createQueryBuilder('p').leftJoin('p.material', 'm')
        .select(['p.strId AS id', 'm.strName AS name', 'p.dtmExpirationDate AS "expiresAt"', 'p.fltQuantity AS quantity'])
        .where('p.strTenantId = :t', { t: tenantId })
        .andWhere('p.dtmExpirationDate BETWEEN :now AND :limit', { now, limit: new Date(now.getTime() + 15 * DAY_MS) })
        .orderBy('p.dtmExpirationDate', 'ASC').limit(5).getRawMany(),
    ]);

    const byId = new Map(materials.map((m) => [m.strId, m]));
    const low = materials
      .filter((m) => num(m.ingMinStock) > 0 && available(m.ingQuantity, m.ingReservedStock) < num(m.ingMinStock))
      .map((m) => ({ id: m.strId, name: m.strName, stock: available(m.ingQuantity, m.ingReservedStock), min: num(m.ingMinStock), unit: m.strUnitMeasure }))
      .sort((a, b) => a.stock / a.min - b.stock / b.min);
    const out = materials.filter((m) => available(m.ingQuantity, m.ingReservedStock) <= 0);

    // Consumo de 30 días (salidas) y materiales sin movimiento
    const consumed = new Map<string, { name: string; quantity: number; value: number; unit: string }>();
    const moved = new Set<string>();
    for (const mv of movements) {
      if (mv.strMaterialId) moved.add(mv.strMaterialId);
      if (mv.strType !== 'OUT' || !mv.strMaterialId) continue;
      const m = byId.get(mv.strMaterialId);
      if (!m) continue;
      const cur = consumed.get(m.strId) || { name: m.strName, quantity: 0, value: 0, unit: m.strUnitMeasure };
      cur.quantity += num(mv.fltQuantity);
      cur.value += num(mv.fltQuantity) * (num(mv.fltUnitPrice) || num(m.fltPrice));
      consumed.set(m.strId, cur);
    }
    const idle = materials.filter((m) => !moved.has(m.strId) && num(m.ingQuantity) > 0);
    const purchaseValue = (from: Date, to: Date) => purchases
      .filter((p) => p.dtmCreationDate >= from && p.dtmCreationDate < to)
      .reduce((s, p) => s + num(p.fltQuantity) * num(p.fltUnitPrice), 0);
    const inStock = materials.filter((m) => num(m.ingQuantity) > 0);

    return {
      generatedAt: now.toISOString(),
      kpis: {
        materials: materials.length,
        composites: composites.length,
        resale: materials.filter((m) => m.blnForResale).length,
        value: Math.round(materials.reduce((s, m) => s + num(m.ingQuantity) * num(m.fltPrice), 0)),
        compositesValue: Math.round(composites.reduce((s, m) => s + num(m.ingQuantity) * num(m.fltPrice), 0)),
        lowStock: low.length,
        outOfStock: out.length,
        healthPercent: materials.length ? Math.round(((materials.length - low.length) / materials.length) * 100) : null,
        consumption30: Math.round([...consumed.values()].reduce((s, c) => s + c.value, 0)),
        purchasesMonth: Math.round(purchaseValue(monthStart, new Date(now.getTime() + 1))),
        purchasesPrevMonth: Math.round(purchaseValue(prevMonthStart, monthStart)),
        idle30: idle.length,
      },
      alerts: {
        lowStock: low.slice(0, 6),
        outOfStock: out.slice(0, 5).map((m) => ({ id: m.strId, name: m.strName, unit: m.strUnitMeasure })),
        expiringLots: expiring.map((e) => ({ ...e, quantity: num(e.quantity), daysLeft: Math.ceil((new Date(e.expiresAt).getTime() - now.getTime()) / DAY_MS) })),
        idle: idle.sort((a, b) => num(b.ingQuantity) * num(b.fltPrice) - num(a.ingQuantity) * num(a.fltPrice)).slice(0, 5)
          .map((m) => ({ id: m.strId, name: m.strName, value: Math.round(num(m.ingQuantity) * num(m.fltPrice)) })),
      },
      topConsumed: [...consumed.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((c) => ({ ...c, value: Math.round(c.value) })),
      topValue: inStock.map((m) => ({ name: m.strName, value: Math.round(num(m.ingQuantity) * num(m.fltPrice)) }))
        .sort((a, b) => b.value - a.value).slice(0, 5),
      activity: movements.sort((a, b) => +new Date(b.dtmCreationDate) - +new Date(a.dtmCreationDate)).slice(0, 8).map((mv) => ({
        id: mv.strId, type: mv.strType, reason: mv.strReason,
        name: byId.get(mv.strMaterialId)?.strName || 'Material', quantity: num(mv.fltQuantity),
        unit: byId.get(mv.strMaterialId)?.strUnitMeasure || '', at: mv.dtmCreationDate,
      })),
    };
  }

  // ─── Productos ─────────────────────────────────────────────────────────────
  async productsPanel(tenantId: string) {
    const now = new Date();
    const monthStart = bogotaMonthStart(now);
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const [products, productions, sold] = await Promise.all([
      this.products.find({ where: { strTenantId: tenantId } as any }),
      this.productions.createQueryBuilder('p').where('p.strTenantId = :t AND p.dtmCreationDate >= :from', { t: tenantId, from: since30 }).getMany(),
      this.soldSince(tenantId, since30),
    ]);
    const byId = new Map(products.map((p) => [p.strId, p]));
    const byName = new Map(products.map((p) => [p.strName.trim().toLowerCase(), p]));

    const units = new Map<string, { name: string; quantity: number; value: number }>();
    for (const t of sold.filter((x) => x.at >= monthStart)) {
      for (const l of t.lines) {
        const p = byId.get(l.id) || byName.get(l.name.toLowerCase());
        if (!p) continue;
        const cur = units.get(p.strId) || { name: p.strName, quantity: 0, value: 0 };
        cur.quantity += l.quantity; cur.value += l.value;
        units.set(p.strId, cur);
      }
    }
    const soldIds30 = new Set<string>();
    for (const t of sold) for (const l of t.lines) { const p = byId.get(l.id) || byName.get(l.name.toLowerCase()); if (p) soldIds30.add(p.strId); }

    const priced = products.filter((p) => num(p.fltPrice) > 0 && num(p.fltCost) > 0);
    const margin = (p: Product) => (num(p.fltPrice) - num(p.fltCost)) / num(p.fltPrice);
    const low = products
      .filter((p) => !p.blnMadeToOrder && num(p.ingStockMin) > 0 && available(p.ingQuantity, p.ingReservedStock) < num(p.ingStockMin))
      .map((p) => ({ id: p.strId, name: p.strName, stock: available(p.ingQuantity, p.ingReservedStock), min: num(p.ingStockMin) }));
    const out = products.filter((p) => !p.blnMadeToOrder && available(p.ingQuantity, p.ingReservedStock) <= 0);
    const lowMargin = priced.filter((p) => margin(p) < 0.15).map((p) => ({ id: p.strId, name: p.strName, margin: Math.round(margin(p) * 100) }));
    const noSales = products.filter((p) => !soldIds30.has(p.strId));
    const producedMonth = productions.filter((p) => p.dtmCreationDate >= monthStart);

    return {
      generatedAt: now.toISOString(),
      kpis: {
        products: products.length,
        inMarketplace: products.filter((p) => p.blnMarketplaceVisible).length,
        madeToOrder: products.filter((p) => p.blnMadeToOrder).length,
        value: Math.round(products.reduce((s, p) => s + num(p.ingQuantity) * (num(p.fltCost) || num(p.fltPrice)), 0)),
        avgMargin: priced.length ? Math.round((priced.reduce((s, p) => s + margin(p), 0) / priced.length) * 100) : null,
        unitsSoldMonth: [...units.values()].reduce((s, u) => s + u.quantity, 0),
        revenueMonth: Math.round([...units.values()].reduce((s, u) => s + u.value, 0)),
        producedMonth: producedMonth.reduce((s, p) => s + num(p.fltQuantity), 0),
        batchesMonth: producedMonth.length,
        lowStock: low.length,
        outOfStock: out.length,
        noSales30: noSales.length,
      },
      alerts: {
        lowStock: low.slice(0, 6),
        outOfStock: out.slice(0, 5).map((p) => ({ id: p.strId, name: p.strName })),
        lowMargin: lowMargin.sort((a, b) => a.margin - b.margin).slice(0, 5),
        noSales: noSales.slice(0, 5).map((p) => ({ id: p.strId, name: p.strName })),
      },
      topSold: [...units.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((u) => ({ ...u, value: Math.round(u.value) })),
      recentProductions: productions.sort((a, b) => +new Date(b.dtmCreationDate) - +new Date(a.dtmCreationDate)).slice(0, 6).map((p) => ({
        id: p.strId, name: byId.get(p.strProductId)?.strName || 'Producto', quantity: num(p.fltQuantity), batch: p.strBatchReference, at: p.dtmCreationDate,
      })),
    };
  }

  // ─── Comercial (ventas y pedidos) ──────────────────────────────────────────
  async commercialPanel(tenantId: string) {
    const now = new Date();
    const monthStart = bogotaMonthStart(now);
    const prevMonthStart = bogotaMonthStart(now, -1);
    const todayStart = bogotaDayStart(now);
    const [sold, active, cancelledMonth] = await Promise.all([
      this.soldSince(tenantId, prevMonthStart),
      this.orders.find({ where: { tenantId, status: In(ACTIVE_ORDER) } }),
      this.orders.createQueryBuilder('o').where('o.tenantId = :t AND o.status = :st AND o.updatedAt >= :from', { t: tenantId, st: OrderStatus.CANCELLED, from: monthStart }).getCount(),
    ]);
    const month = sold.filter((t) => t.at >= monthStart);
    const prev = sold.filter((t) => t.at >= prevMonthStart && t.at < monthStart);
    const sum = (l: typeof sold) => l.reduce((s, t) => s + t.total, 0);
    const group = (key: (t: (typeof sold)[number]) => string) => {
      const m = new Map<string, { label: string; value: number; count: number }>();
      for (const t of month) { const k = key(t) || 'Otro'; const c = m.get(k) || { label: k, value: 0, count: 0 }; c.value += t.total; c.count++; m.set(k, c); }
      return [...m.values()].sort((a, b) => b.value - a.value).map((g) => ({ ...g, value: Math.round(g.value) }));
    };
    const METHODS: Record<string, string> = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata', PSE: 'PSE', OTRO: 'Otro' };
    const customers = new Map<string, { name: string; value: number; count: number }>();
    for (const t of month) {
      const k = t.customerId || t.customerName.toLowerCase(); if (!k) continue;
      const c = customers.get(k) || { name: t.customerName || 'Cliente', value: 0, count: 0 }; c.value += t.total; c.count++; customers.set(k, c);
    }
    const days: { date: string; revenue: number }[] = [];
    for (let k = 13; k >= 0; k--) days.push({ date: dayKey(bogotaDayStart(now, -k)), revenue: 0 });
    const byDay = new Map(days.map((d) => [d.date, d]));
    for (const t of sold) { const d = byDay.get(dayKey(t.at)); if (d) d.revenue += t.total; }
    const byStage: Record<string, number> = {};
    for (const o of active) byStage[o.status] = (byStage[o.status] || 0) + 1;

    return {
      generatedAt: now.toISOString(),
      kpis: {
        revenueMonth: Math.round(sum(month)), revenuePrevMonth: Math.round(sum(prev)),
        countMonth: month.length, countPrevMonth: prev.length,
        avgTicket: month.length ? Math.round(sum(month) / month.length) : 0,
        today: Math.round(sum(sold.filter((t) => t.at >= todayStart))),
        todayCount: sold.filter((t) => t.at >= todayStart).length,
        creditShare: month.length ? Math.round((sum(month.filter((t) => t.paymentType === 'CREDITO')) / Math.max(1, sum(month))) * 100) : 0,
        activeOrders: active.length,
        delayedOrders: active.filter((o) => o.stageDueAt && new Date(o.stageDueAt) < now).length,
        cancelledMonth,
      },
      byChannel: group((t) => t.channel),
      byPaymentType: group((t) => (t.paymentType === 'CREDITO' ? 'Crédito' : 'Contado')),
      byMethod: group((t) => (t.paymentType === 'CREDITO' ? 'Crédito' : METHODS[t.paymentMethod] || (t.paymentMethod ? t.paymentMethod : 'Sin registrar'))),
      topCustomers: [...customers.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((c) => ({ ...c, value: Math.round(c.value) })),
      ordersByStage: byStage,
      days: days.map((d) => ({ ...d, revenue: Math.round(d.revenue) })),
    };
  }

  // ─── Clientes ──────────────────────────────────────────────────────────────
  /**
   * Los clientes son usuarios de Authoriza con rol clienteInout (el mismo
   * listado del módulo Clientes), por eso se reenvía el token de la sesión.
   */
  async customersPanel(tenantId: string, authorization?: string) {
    const now = new Date();
    const monthStart = bogotaMonthStart(now);
    const since90 = new Date(now.getTime() - 90 * DAY_MS);
    const [customers, sold, openRec] = await Promise.all([
      this.customersService.findByTenantId(tenantId, authorization) as Promise<any[]>,
      this.soldSince(tenantId, since90),
      this.receivables.find({ where: { tenantId, status: In([ReceivableStatus.PENDIENTE, ReceivableStatus.PARCIAL]) } }),
    ]);
    const nameOf = (c: any): string => c.businessName || [c.firstName, c.firstSurname].filter(Boolean).join(' ') || c.email || 'Cliente';
    const stats = new Map<string, { name: string; value: number; count: number; last: Date; first: Date }>();
    for (const t of sold) {
      if (!t.customerId) continue;
      const c = stats.get(t.customerId) || { name: t.customerName, value: 0, count: 0, last: t.at, first: t.at };
      c.value += t.total; c.count++;
      if (t.at > c.last) c.last = t.at;
      if (t.at < c.first) c.first = t.at;
      stats.set(t.customerId, c);
    }
    const byId = new Map(customers.map((c) => [c.id, c]));
    const buyers = [...stats.entries()];
    const active30 = buyers.filter(([, s]) => now.getTime() - s.last.getTime() <= 30 * DAY_MS);
    const recurrent = buyers.filter(([, s]) => s.count >= 2);
    // En riesgo: compraban (2+ compras en 90 días) y llevan más de 30 días sin volver
    const atRisk = buyers.filter(([, s]) => s.count >= 2 && now.getTime() - s.last.getTime() > 30 * DAY_MS)
      .sort((a, b) => b[1].value - a[1].value).slice(0, 5)
      .map(([id, s]) => ({ id, name: byId.get(id) ? nameOf(byId.get(id)!) : s.name, value: Math.round(s.value), daysSince: Math.floor((now.getTime() - s.last.getTime()) / DAY_MS) }));
    const todayKey = dayKey(now);
    const overdueBy = new Map<string, { name: string; balance: number }>();
    for (const r of openRec.filter((x) => x.dueDate && x.dueDate < todayKey)) {
      const c = overdueBy.get(r.customerId) || { name: r.customerName, balance: 0 }; c.balance += num(r.balance); overdueBy.set(r.customerId, c);
    }
    const monthValue = sold.filter((t) => t.at >= monthStart && t.customerId).reduce((s, t) => s + t.total, 0);
    const monthBuyers = new Set(sold.filter((t) => t.at >= monthStart && t.customerId).map((t) => t.customerId));

    return {
      generatedAt: now.toISOString(),
      kpis: {
        total: customers.length,
        newThisMonth: customers.filter((c) => c.createdAt && new Date(c.createdAt) >= monthStart).length,
        active30: active30.length,
        recurrent: recurrent.length,
        recurrentPercent: buyers.length ? Math.round((recurrent.length / buyers.length) * 100) : null,
        avgPerCustomer: monthBuyers.size ? Math.round(monthValue / monthBuyers.size) : 0,
        withOverdue: overdueBy.size,
        atRisk: atRisk.length,
      },
      topCustomers: buyers.sort((a, b) => b[1].value - a[1].value).slice(0, 5)
        .map(([id, s]) => ({ id, name: byId.get(id) ? nameOf(byId.get(id)!) : s.name, value: Math.round(s.value), count: s.count })),
      atRisk,
      overdue: [...overdueBy.entries()].sort((a, b) => b[1].balance - a[1].balance).slice(0, 5).map(([id, c]) => ({ id, name: c.name, balance: Math.round(c.balance) })),
      newest: customers.filter((c) => c.createdAt).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5).map((c) => ({ id: c.id, name: nameOf(c), at: c.createdAt })),
    };
  }
}

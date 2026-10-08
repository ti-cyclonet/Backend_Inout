import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrderPayment } from '../orders/entities/order-payment.entity';
import { Receivable, ReceivableStatus } from '../credit/entities/receivable.entity';
import { CustomersService } from '../customers/customers.service';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { PurchaseRecord } from '../purchases/entities/purchase-record.entity';

import { BOGOTA_OFFSET_MS, DAY_MS, SALES_SINCE_SQL, bogotaDayStart, bogotaMonthStart, dayKey, num, saleAt, salesSinceParams } from './panel-utils';

/** Pedidos en curso (ni borrador ni cerrados). */
export const ACTIVE_ORDER = [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY];
/** Pedidos que ya cuentan como venta (como en sales/stats). */
export const SOLD_ORDER = [OrderStatus.DELIVERED, OrderStatus.INVOICED];

/** Total de una venta directa (las antiguas no guardan `total`). */
export const saleTotal = (s: Sale) => (s.total != null ? num(s.total) : num(s.fltQuantity) * num(s.fltUnitPrice));
/** Cuándo un pedido pasó a ser venta: al facturarse, o su última actualización al entregarse. */
export const orderSoldAt = (o: Order) => o.invoicedAt || o.updatedAt || o.createdAt;

/**
 * Resumen del Dashboard de InOut para el tenant de la sesión: ventas (directas
 * + pedidos entregados/facturados) con comparación contra el mes anterior,
 * pedidos en curso, cartera, inventario, alertas accionables y series.
 * El front lo consulta cada 30 s.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private sales: Repository<Sale>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(OrderPayment) private payments: Repository<OrderPayment>,
    @InjectRepository(Receivable) private receivables: Repository<Receivable>,
    private readonly customersService: CustomersService,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Material) private materials: Repository<Material>,
    @InjectRepository(PurchaseRecord) private purchases: Repository<PurchaseRecord>,
  ) {}

  async getOverview(tenantId: string, authorization?: string) {
    const now = new Date();
    const monthStart = bogotaMonthStart(now);
    const prevMonthStart = bogotaMonthStart(now, -1);
    const sixMonthsStart = bogotaMonthStart(now, -5);
    const todayStart = bogotaDayStart(now);
    const tomorrowStart = bogotaDayStart(now, 1);
    const in15Days = new Date(now.getTime() + 15 * DAY_MS);
    const todayKey = dayKey(now);

    const [sales, soldOrders, activeOrders, pendingPayments, openReceivables, clientList, _unused, products, materials, expiring] = await Promise.all([
      this.sales.createQueryBuilder('s')
        .where('s.strTenantId = :t', { t: tenantId })
        .andWhere(SALES_SINCE_SQL, salesSinceParams(sixMonthsStart))
        .getMany(),
      this.orders.createQueryBuilder('o')
        .where('o.tenantId = :t', { t: tenantId })
        .andWhere('o.status IN (:...st)', { st: SOLD_ORDER })
        .andWhere('COALESCE(o.invoicedAt, o.updatedAt) >= :from', { from: sixMonthsStart })
        .getMany(),
      this.orders.find({ where: { tenantId, status: In(ACTIVE_ORDER) }, order: { createdAt: 'ASC' } }),
      this.payments.count({ where: { tenantId, status: 'PENDIENTE_VERIFICACION' } }),
      this.receivables.find({ where: { tenantId, status: In([ReceivableStatus.PENDIENTE, ReceivableStatus.PARCIAL]) } }),
      // Clientes = usuarios de Authoriza con rol clienteInout (módulo Clientes)
      this.customersService.findByTenantId(tenantId, authorization).catch(() => []) as Promise<any[]>,
      Promise.resolve(0),
      this.products.find({ where: { strTenantId: tenantId } as any }),
      this.materials.find({ where: { strTenantId: tenantId } as any }),
      this.purchases.createQueryBuilder('p')
        .leftJoin('p.material', 'm')
        .select(['p.strId AS id', 'm.strName AS name', 'p.dtmExpirationDate AS "expiresAt"', 'p.fltQuantity AS quantity'])
        .where('p.strTenantId = :t', { t: tenantId })
        .andWhere('p.dtmExpirationDate BETWEEN :now AND :limit', { now, limit: in15Days })
        .orderBy('p.dtmExpirationDate', 'ASC').limit(5).getRawMany(),
    ]);

    // ─── Ventas: directas + pedidos vendidos ───
    type Tx = { at: Date; total: number; kind: 'sale' | 'order'; code: string; customer: string; items: any[] };
    const txs: Tx[] = [
      ...sales.map((s) => ({ at: saleAt(s), total: saleTotal(s), kind: 'sale' as const, code: s.strInvoiceCode, customer: s.customerName, items: Array.isArray(s.items) ? s.items : [] })),
      ...soldOrders.map((o) => ({ at: orderSoldAt(o), total: num(o.total), kind: 'order' as const, code: o.orderCode, customer: (o.customerName || '').split(' | ')[0], items: Array.isArray(o.items) ? o.items : [] })),
    ].filter((t) => t.at);

    const inRange = (t: Tx, from: Date, to: Date) => t.at >= from && t.at < to;
    const month = txs.filter((t) => inRange(t, monthStart, tomorrowStart));
    const prev = txs.filter((t) => inRange(t, prevMonthStart, monthStart));
    const today = txs.filter((t) => inRange(t, todayStart, tomorrowStart));
    const sum = (list: Tx[]) => list.reduce((s, t) => s + t.total, 0);
    const monthRevenue = sum(month);

    // Top productos del mes (por valor vendido)
    const top = new Map<string, { name: string; value: number; quantity: number }>();
    for (const t of month) {
      for (const it of t.items) {
        const name = String(it?.productName || it?.product || it?.name || '').trim();
        if (!name) continue;
        const qty = num(it?.quantity);
        const value = num(it?.total) || num(it?.subtotal) || qty * num(it?.unitPrice ?? it?.price);
        const cur = top.get(name) || { name, value: 0, quantity: 0 };
        cur.value += value; cur.quantity += qty;
        top.set(name, cur);
      }
    }

    // ─── Pedidos en curso ───
    const byStage: Record<string, number> = {};
    for (const o of activeOrders) byStage[o.status] = (byStage[o.status] || 0) + 1;
    const delayed = activeOrders.filter((o) => o.stageDueAt && new Date(o.stageDueAt) < now);
    const scheduledToday = activeOrders.filter((o) => o.scheduledStart && dayKey(o.scheduledStart) === todayKey);

    // ─── Cartera ───
    const overdueRec = openReceivables.filter((r) => r.dueDate && r.dueDate < todayKey);
    const recBalance = (list: Receivable[]) => list.reduce((s, r) => s + num(r.balance), 0);

    // ─── Inventario ───
    const available = (qty: any, reserved: any) => num(qty) - num(reserved);
    const lowProducts = products
      .filter((p) => num(p.ingStockMin) > 0 && available(p.ingQuantity, p.ingReservedStock) < num(p.ingStockMin))
      .map((p) => ({ name: p.strName, stock: available(p.ingQuantity, p.ingReservedStock), min: num(p.ingStockMin), kind: 'Producto' }));
    const lowMaterials = materials
      .filter((m) => num(m.ingMinStock) > 0 && available(m.ingQuantity, m.ingReservedStock) < num(m.ingMinStock))
      .map((m) => ({ name: m.strName, stock: available(m.ingQuantity, m.ingReservedStock), min: num(m.ingMinStock), kind: 'Material', unit: m.strUnitMeasure }));
    const lowStock = [...lowProducts, ...lowMaterials].sort((a, b) => a.stock / a.min - b.stock / b.min);
    const materialsValue = materials.reduce((s, m) => s + num(m.ingQuantity) * num(m.fltPrice), 0);
    const productsValue = products.reduce((s, p) => s + num(p.ingQuantity) * (num(p.fltCost) || num(p.fltPrice)), 0);

    // ─── Series ───
    const months: { key: string; label: string; revenue: number; count: number }[] = [];
    for (let k = 5; k >= 0; k--) {
      const start = bogotaMonthStart(now, -k);
      months.push({
        key: dayKey(start).slice(0, 7),
        label: new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'America/Bogota' }).format(start).replace('.', ''),
        revenue: 0, count: 0,
      });
    }
    const byMonth = new Map(months.map((m) => [m.key, m]));
    const days: { date: string; revenue: number; count: number }[] = [];
    for (let k = 13; k >= 0; k--) days.push({ date: dayKey(bogotaDayStart(now, -k)), revenue: 0, count: 0 });
    const byDay = new Map(days.map((d) => [d.date, d]));
    for (const t of txs) {
      const m = byMonth.get(dayKey(t.at).slice(0, 7)); if (m) { m.revenue += t.total; m.count++; }
      const d = byDay.get(dayKey(t.at)); if (d) { d.revenue += t.total; d.count++; }
    }

    // ─── Actividad reciente: ventas y movimientos de pedidos ───
    const activity = [
      ...txs.map((t) => ({ id: `${t.kind}-${t.code}-${new Date(t.at).getTime()}`, kind: t.kind === 'sale' ? 'SALE' : 'ORDER_SOLD', title: t.kind === 'sale' ? `Venta ${t.code || ''}`.trim() : `Pedido ${t.code} vendido`, detail: t.customer || 'Cliente', value: t.total, at: t.at })),
      ...activeOrders.map((o) => ({ id: `stage-${o.id}-${new Date(o.stageEnteredAt || o.updatedAt).getTime()}`, kind: o.status, title: `Pedido ${o.orderCode}`, detail: (o.customerName || '').split(' | ')[0] || 'Cliente', value: num(o.total), at: o.stageEnteredAt || o.updatedAt })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);

    return {
      generatedAt: now.toISOString(),
      sales: {
        monthRevenue,
        prevMonthRevenue: sum(prev),
        monthCount: month.length,
        prevMonthCount: prev.length,
        avgTicket: month.length ? Math.round(monthRevenue / month.length) : 0,
        todayRevenue: sum(today),
        todayCount: today.length,
      },
      orders: {
        active: activeOrders.length,
        byStage,
        delayed: delayed.length,
        scheduledToday: scheduledToday.length,
        pendingPayments,
        activeValue: activeOrders.reduce((s, o) => s + num(o.total), 0),
      },
      receivables: {
        balance: recBalance(openReceivables),
        count: openReceivables.length,
        overdueBalance: recBalance(overdueRec),
        overdueCount: overdueRec.length,
      },
      inventory: {
        value: Math.round(materialsValue + productsValue),
        materialsValue: Math.round(materialsValue),
        productsValue: Math.round(productsValue),
        productsCount: products.length,
        materialsCount: materials.length,
        lowStockCount: lowStock.length,
        healthPercent: products.length + materials.length
          ? Math.round(((products.length + materials.length - lowStock.length) / (products.length + materials.length)) * 100)
          : null,
      },
      customers: {
        total: clientList.length,
        newThisMonth: clientList.filter((c) => c.createdAt && new Date(c.createdAt) >= monthStart).length,
      },
      alerts: {
        lowStock: lowStock.slice(0, 6),
        delayedOrders: delayed.slice(0, 5).map((o) => ({ id: o.id, code: o.orderCode, customer: (o.customerName || '').split(' | ')[0], status: o.status, minutesLate: Math.round((now.getTime() - new Date(o.stageDueAt!).getTime()) / 60000) })),
        overdueReceivables: overdueRec.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map((r) => ({ id: r.id, code: r.documentCode, customer: r.customerName, balance: num(r.balance), dueDate: r.dueDate })),
        expiringLots: expiring.map((e) => ({ ...e, quantity: num(e.quantity), daysLeft: Math.ceil((new Date(e.expiresAt).getTime() - now.getTime()) / DAY_MS) })),
      },
      series: {
        months,
        days,
        topProducts: [...top.values()].sort((a, b) => b.value - a.value).slice(0, 5),
      },
      activity,
    };
  }
}

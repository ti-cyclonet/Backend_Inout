import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import { DiningTable } from './entities/dining-table.entity';
import { TableReservation } from './entities/table-reservation.entity';
import { DiningSettingsEntity } from './entities/dining-settings.entity';
import { MarketplaceConfig } from '../marketplace-config/entities/marketplace-config.entity';
import { BusinessModulesService } from '../business-modules/business-modules.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { LimitEnforcementService, STORE_PAUSED_MESSAGE } from '../usage-counters/limit-enforcement.service';
import { resolveMenuExtras } from '../marketplace-config/menu-extras';
import { resolvePaymentOptions } from '../orders/payment-plans';
import { bogotaDate, bogotaToUtc, resolveScheduling } from '../orders/scheduling';
import {
  BLOCKING, DiningSettings, ReservationLike, ReservationStatus, STATUS_LABELS, assertBookableDate, assertTransition,
  customerMayCancel, depositFor, diningSlots, findConflict, nextReservationCode, onlineInitialStatus,
  resolveDiningSettings, validateDiningSettings, validateTable,
} from './dining-rules';

const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Reserva de la tienda online (el cliente, sin sesión). */
export interface OnlineReservationInput {
  date?: string;
  time?: string;
  partySize?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
  notes?: string | null;
  acceptTerms?: boolean;
  acceptHabeasData?: boolean;
  termsVersion?: string;
  habeasDataVersion?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const text = (v: unknown, max: number): string | null => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

export interface ReservationInput {
  tableIds?: string[];
  partySize?: number;
  /** 'YYYY-MM-DD' y 'HH:MM' en hora de Colombia. */
  date?: string;
  time?: string;
  durationMinutes?: number;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  /** Llegó sin reserva: se sienta ya. */
  walkIn?: boolean;
}

@Injectable()
export class DiningService {
  constructor(
    @InjectRepository(DiningTable) private readonly tables: Repository<DiningTable>,
    @InjectRepository(TableReservation) private readonly reservations: Repository<TableReservation>,
    @InjectRepository(DiningSettingsEntity) private readonly settingsRepo: Repository<DiningSettingsEntity>,
    @InjectRepository(MarketplaceConfig) private readonly marketplaceRepo: Repository<MarketplaceConfig>,
    private readonly modules: BusinessModulesService,
    private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
    private readonly limits: LimitEnforcementService,
  ) {}

  /** Mesas y reservas debe estar activo en Funciones de mi negocio. */
  async assertEnabled(tenantId: string): Promise<void> {
    if (!(await this.modules.isEnabled(tenantId, 'tables'))) {
      throw new ForbiddenException({
        error: 'MODULE_DISABLED',
        message: 'Mesas y reservas no está activo. Actívalo en Configuración › Funciones de mi negocio.',
      });
    }
  }

  // ─── Configuración ───

  async getSettings(tenantId: string): Promise<DiningSettings> {
    const row = await this.settingsRepo.findOne({ where: { tenantId } });
    return resolveDiningSettings(row?.settings as any);
  }

  async updateSettings(tenantId: string, raw: any): Promise<DiningSettings> {
    const settings = validateDiningSettings({ ...(await this.getSettings(tenantId)), ...(raw || {}) });
    let row = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!row) row = this.settingsRepo.create({ tenantId });
    row.settings = settings as any;
    await this.settingsRepo.save(row);
    return settings;
  }

  /** Horario de atención de la tienda (Pedidos programados). */
  private async hours(tenantId: string) {
    const cfg = await this.marketplaceRepo.findOne({ where: { tenantId }, select: ['id', 'scheduling'] });
    return resolveScheduling(cfg?.scheduling as any).hours;
  }

  // ─── Mesas ───

  listTables(tenantId: string) {
    return this.tables.find({ where: { tenantId, active: true }, order: { zone: 'ASC', name: 'ASC' } });
  }

  async createTable(tenantId: string, raw: any) {
    const data = validateTable(raw);
    await this.assertUniqueName(tenantId, data.name!);
    return this.tables.save(this.tables.create({ ...data, tenantId, active: true }));
  }

  async updateTable(tenantId: string, id: string, raw: any) {
    const table = await this.findTable(tenantId, id);
    const data = validateTable(raw, true);
    if (data.name && data.name.toLowerCase() !== table.name.toLowerCase()) await this.assertUniqueName(tenantId, data.name, id);
    Object.assign(table, data);
    return this.tables.save(table);
  }

  /** Guarda las posiciones del plano de una vez. */
  async saveLayout(tenantId: string, raw: any) {
    const items: { id: string; posX: number; posY: number }[] = Array.isArray(raw?.tables) ? raw.tables : [];
    if (!items.length || items.length > 300) throw new BadRequestException('No hay posiciones para guardar.');
    const own = await this.tables.find({ where: { tenantId, id: In(items.map((i) => i.id)) } });
    const byId = new Map(own.map((t) => [t.id, t]));
    for (const item of items) {
      const t = byId.get(item.id);
      if (!t) continue;
      Object.assign(t, validateTable({ posX: item.posX, posY: item.posY }, true));
    }
    await this.tables.save([...byId.values()]);
    return this.listTables(tenantId);
  }

  /** Las mesas con reservas por venir no se quitan hasta moverlas o cancelarlas. */
  async removeTable(tenantId: string, id: string) {
    const table = await this.findTable(tenantId, id);
    const upcoming = (await this.reservations
      .createQueryBuilder('r')
      .where('r.tenantId = :tenantId', { tenantId })
      .andWhere('r.status IN (:...st)', { st: BLOCKING })
      .andWhere('r.endAt > NOW()')
      .getMany()).filter((r) => r.tableIds.includes(id));
    if (upcoming.length) {
      throw new BadRequestException(`${table.name} tiene ${upcoming.length} ${upcoming.length === 1 ? 'reserva' : 'reservas'} por atender. Muévelas a otra mesa o cancélalas antes de quitarla.`);
    }
    table.active = false;
    await this.tables.save(table);
    return { success: true };
  }

  private async findTable(tenantId: string, id: string) {
    const t = await this.tables.findOne({ where: { id, tenantId, active: true } });
    if (!t) throw new NotFoundException('Mesa no encontrada.');
    return t;
  }

  private async assertUniqueName(tenantId: string, name: string, exceptId?: string) {
    const same = await this.tables
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId AND t.active = true AND LOWER(t.name) = LOWER(:name)', { tenantId, name })
      .getOne();
    if (same && same.id !== exceptId) throw new BadRequestException(`Ya existe una mesa llamada ${name}.`);
  }

  // ─── Reservas ───

  /** Reservas de un día (Colombia) y las que siguen en la mesa de días anteriores. */
  async listReservations(tenantId: string, date: string) {
    if (!DATE_RE.test(date || '')) throw new BadRequestException('Fecha inválida.');
    const from = bogotaToUtc(date, 0);
    const to = bogotaToUtc(date, 24 * 60);
    const [ofDay, seated] = await Promise.all([
      this.reservations.find({ where: { tenantId, startAt: Between(from, to) }, order: { startAt: 'ASC' } }),
      this.reservations.find({ where: { tenantId, status: 'SEATED' } }),
    ]);
    const map = new Map([...ofDay, ...seated].map((r) => [r.id, r]));
    return [...map.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  async availability(tenantId: string, date: string, partySize: number, now = new Date()) {
    if (!DATE_RE.test(date || '')) throw new BadRequestException('Fecha inválida.');
    const party = Math.max(1, Math.round(Number(partySize) || 1));
    const [settings, hours, tables] = await Promise.all([this.getSettings(tenantId), this.hours(tenantId), this.listTables(tenantId)]);
    const res = await this.listReservations(tenantId, date);
    return { date, partySize: party, slots: diningSlots(date, party, settings, hours, tables, res as unknown as ReservationLike[], now) };
  }

  async createReservation(tenantId: string, input: ReservationInput, source: 'STAFF' | 'MARKETPLACE' = 'STAFF', now = new Date()) {
    const settings = await this.getSettings(tenantId);
    const walkIn = input.walkIn === true && source === 'STAFF';
    const partySize = Math.round(Number(input.partySize));
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 200) throw new BadRequestException('Indica cuántas personas son.');
    const duration = Math.round(Number(input.durationMinutes) || settings.durationMinutes);
    if (duration < 15 || duration > 720) throw new BadRequestException('La duración va de 15 minutos a 12 horas.');

    let start: Date;
    if (walkIn) start = now;
    else {
      if (!DATE_RE.test(input.date || '') || !TIME_RE.test(input.time || '')) throw new BadRequestException('Indica la fecha y la hora de la reserva.');
      const [h, m] = input.time!.split(':').map(Number);
      start = bogotaToUtc(input.date!, h * 60 + m);
      if (start.getTime() < now.getTime() - 15 * 60_000) throw new BadRequestException('La hora de la reserva ya pasó.');
    }
    const end = new Date(start.getTime() + duration * 60_000);
    const customerName = text(input.customerName, 120) || (walkIn ? 'Cliente sin reserva' : null);
    if (!customerName) throw new BadRequestException('Escribe el nombre de quien reserva.');

    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, tenantId);
      const tableIds = await this.checkTables(manager, tenantId, input.tableIds);
      await this.assertFree(manager, tenantId, tableIds, start, end, now);
      const last = await manager.getRepository(TableReservation).findOne({ where: { tenantId }, order: { code: 'DESC' }, select: ['id', 'code'] });
      const r = manager.getRepository(TableReservation).create({
        tenantId,
        code: nextReservationCode(last?.code),
        tableIds,
        partySize,
        startAt: start,
        endAt: end,
        status: walkIn ? 'SEATED' : source === 'MARKETPLACE' && settings.confirmMode === 'manual' ? 'PENDING' : 'CONFIRMED',
        source: walkIn ? 'WALK_IN' : source,
        seatedAt: walkIn ? now : null,
        customerId: text(input.customerId, 255),
        customerName,
        customerPhone: text(input.customerPhone, 30),
        customerEmail: text(input.customerEmail, 120)?.toLowerCase() || null,
        notes: text(input.notes, 500),
      });
      return manager.getRepository(TableReservation).save(r);
    });
  }

  /** Cambia mesa, hora, duración, personas o datos de una reserva por atender. */
  async updateReservation(tenantId: string, id: string, input: ReservationInput, now = new Date()) {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, tenantId);
      const repo = manager.getRepository(TableReservation);
      const r = await repo.findOne({ where: { id, tenantId } });
      if (!r) throw new NotFoundException('Reserva no encontrada.');
      if (!BLOCKING.includes(r.status as ReservationStatus)) throw new BadRequestException('Esta reserva ya terminó; no se puede cambiar.');

      let start = r.startAt;
      if (input.date !== undefined || input.time !== undefined) {
        const date = input.date ?? bogotaDate(r.startAt);
        if (!DATE_RE.test(date) || !TIME_RE.test(input.time || '')) throw new BadRequestException('Indica la fecha y la hora de la reserva.');
        const [h, m] = input.time!.split(':').map(Number);
        start = bogotaToUtc(date, h * 60 + m);
      }
      const duration = input.durationMinutes !== undefined
        ? Math.round(Number(input.durationMinutes))
        : Math.round((r.endAt.getTime() - r.startAt.getTime()) / 60_000);
      if (!(duration >= 15 && duration <= 720)) throw new BadRequestException('La duración va de 15 minutos a 12 horas.');
      const end = new Date(start.getTime() + duration * 60_000);
      const tableIds = input.tableIds !== undefined ? await this.checkTables(manager, tenantId, input.tableIds) : r.tableIds;
      await this.assertFree(manager, tenantId, tableIds, start, end, now, r.id);

      if (input.partySize !== undefined) {
        const p = Math.round(Number(input.partySize));
        if (!Number.isInteger(p) || p < 1 || p > 200) throw new BadRequestException('Indica cuántas personas son.');
        r.partySize = p;
      }
      if (input.customerName !== undefined) {
        const n = text(input.customerName, 120);
        if (!n) throw new BadRequestException('Escribe el nombre de quien reserva.');
        r.customerName = n;
      }
      if (input.customerPhone !== undefined) r.customerPhone = text(input.customerPhone, 30);
      if (input.customerEmail !== undefined) r.customerEmail = text(input.customerEmail, 120)?.toLowerCase() || null;
      if (input.notes !== undefined) r.notes = text(input.notes, 500);
      Object.assign(r, { tableIds, startAt: start, endAt: end });
      return repo.save(r);
    });
  }

  async setStatus(tenantId: string, id: string, status: ReservationStatus, reason?: string, now = new Date()) {
    const r = await this.reservations.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Reserva no encontrada.');
    assertTransition(r.status as ReservationStatus, status);
    if (status === 'NO_SHOW' && now.getTime() < r.startAt.getTime()) {
      throw new BadRequestException('Todavía no es la hora de la reserva.');
    }
    r.status = status;
    if (status === 'SEATED') r.seatedAt = now;
    if (status === 'COMPLETED') {
      r.completedAt = now;
      // Se fueron antes: la mesa queda libre desde ya
      if (r.endAt.getTime() > now.getTime()) r.endAt = now;
    }
    if (status === 'CANCELLED') {
      r.cancelledAt = now;
      r.cancelReason = text(reason, 300);
    }
    return this.reservations.save(r);
  }

  // ─── Tienda online ───

  /**
   * Lo que la tienda muestra para reservar. `enabled` = el negocio tiene Mesas
   * activo, abrió las reservas en la tienda, no es cocina oculta y tiene mesas.
   */
  async publicInfo(tenantId: string) {
    const [settings, tables, cfg, on] = await Promise.all([
      this.getSettings(tenantId),
      this.listTables(tenantId),
      this.marketplaceRepo.findOne({ where: { tenantId }, select: ['id', 'menuExtras', 'paymentOptions'] }),
      this.modules.isEnabled(tenantId, 'tables').catch(() => false),
    ]);
    const deliveryOnly = resolveMenuExtras(cfg?.menuExtras).deliveryOnly;
    const enabled = on && settings.onlineEnabled && !deliveryOnly && tables.length > 0;
    return {
      enabled,
      preorderMode: settings.preorderMode,
      depositMode: settings.depositMode,
      depositAmount: settings.depositAmount,
      depositPerPerson: settings.depositPerPerson,
      durationMinutes: settings.durationMinutes,
      toleranceMinutes: settings.toleranceMinutes,
      minLeadHours: settings.minLeadHours,
      maxDaysAhead: settings.maxDaysAhead,
      confirmMode: settings.confirmMode,
      /** En línea no se unen mesas: el grupo más grande es la mesa más grande. */
      maxPartySize: tables.reduce((m, t) => Math.max(m, t.seats), 0),
      paymentInstructions: resolvePaymentOptions(cfg?.paymentOptions as any).instructions || null,
    };
  }

  private async assertOnline(tenantId: string) {
    await this.limits.assertNotTrialLocked(tenantId, STORE_PAUSED_MESSAGE);
    const info = await this.publicInfo(tenantId);
    if (!info.enabled) throw new BadRequestException('Esta tienda no está recibiendo reservas en línea.');
    return info;
  }

  /** Horas para reservar en la tienda (sin datos de las mesas). */
  async publicAvailability(tenantId: string, date: string, partySize: number, now = new Date()) {
    const info = await this.publicInfo(tenantId);
    if (!info.enabled) return { date, slots: [] };
    const party = Math.max(1, Math.round(Number(partySize) || 1));
    if (party > info.maxPartySize) return { date, slots: [], tooLarge: true };
    const { slots } = await this.availability(tenantId, date, party, now);
    const last = new Date(now.getTime() + info.maxDaysAhead * 86_400_000);
    return {
      date,
      slots: slots.map((s) => ({ start: s.start, end: s.end, available: s.available && s.start.getTime() <= last.getTime() })),
    };
  }

  /** Para el checkout: la tienda recibe reservas con pedido. */
  async assertPreorderAllowed(tenantId: string) {
    const info = await this.assertOnline(tenantId);
    if (info.preorderMode === 'none') throw new BadRequestException('Esta tienda reserva solo la mesa, sin pedido anticipado.');
    return info;
  }

  /**
   * Reserva desde la tienda: la hora debe estar disponible para ese número de
   * personas (se recalcula bajo el bloqueo) y se asigna la mesa más pequeña
   * donde caben. Con `link` va ligada a un pedido anticipado (dentro de la
   * misma transacción del pedido) y el pago lo maneja el pedido.
   */
  async bookOnline(
    tenantId: string,
    input: OnlineReservationInput,
    meta: { ipAddress?: string; userAgent?: string } = {},
    link: { orderId: string; manager: EntityManager; consents: Record<string, any> | null } | null = null,
    now = new Date(),
  ) {
    const info = await this.assertOnline(tenantId);
    if (!link && info.preorderMode === 'required') {
      throw new BadRequestException('En esta tienda la reserva va con el pedido: agrega tus productos al carrito y elige Comer en el local.');
    }
    const settings = await this.getSettings(tenantId);
    const partySize = Math.round(Number(input.partySize));
    if (!Number.isInteger(partySize) || partySize < 1) throw new BadRequestException('Indica cuántas personas son.');
    if (partySize > info.maxPartySize) throw new BadRequestException(`En línea se reserva para máximo ${info.maxPartySize} personas. Para grupos más grandes, escríbele a la tienda.`);
    if (!DATE_RE.test(input.date || '') || !TIME_RE.test(input.time || '')) throw new BadRequestException('Elige la fecha y la hora de la reserva.');
    const customerName = text(input.customerName, 120);
    const customerPhone = text(input.customerPhone, 30);
    if (!customerName || !customerPhone) throw new BadRequestException('Escribe tu nombre y tu celular para la reserva.');
    const [h, m] = input.time!.split(':').map(Number);
    const start = bogotaToUtc(input.date!, h * 60 + m);
    assertBookableDate(start, settings, now);

    let consents = link?.consents || null;
    if (!link) {
      const accepted = input.acceptTerms === true && input.acceptHabeasData === true && !!input.termsVersion && !!input.habeasDataVersion;
      if (!accepted) throw new BadRequestException('Debes aceptar los Términos y Condiciones y autorizar el tratamiento de tus datos personales para reservar.');
      consents = {
        termsVersion: input.termsVersion, habeasDataVersion: input.habeasDataVersion, acceptedAt: now.toISOString(),
        ipAddress: meta.ipAddress?.slice(0, 64) || null, userAgent: meta.userAgent?.slice(0, 500) || null,
      };
    }
    const deposit = link ? 0 : depositFor(settings, partySize);
    const hours = await this.hours(tenantId);

    const run = async (manager: EntityManager) => {
      await this.lock(manager, tenantId);
      const tables = await manager.getRepository(DiningTable).find({ where: { tenantId, active: true } });
      const around = await manager.getRepository(TableReservation)
        .createQueryBuilder('r')
        .where('r.tenantId = :tenantId', { tenantId })
        .andWhere('r.status IN (:...st)', { st: BLOCKING })
        .getMany();
      const slot = diningSlots(input.date!, partySize, settings, hours, tables, around as unknown as ReservationLike[], now)
        .find((s) => s.start.getTime() === start.getTime());
      if (!slot?.available || !slot.tableId) throw new BadRequestException('Esa hora ya no está disponible. Elige otra.');
      const repo = manager.getRepository(TableReservation);
      const last = await repo.findOne({ where: { tenantId }, order: { code: 'DESC' }, select: ['id', 'code'] });
      return repo.save(repo.create({
        tenantId,
        code: nextReservationCode(last?.code),
        tableIds: [slot.tableId],
        partySize,
        startAt: slot.start,
        endAt: slot.end,
        status: onlineInitialStatus(settings, deposit > 0),
        source: 'MARKETPLACE',
        customerName,
        customerPhone,
        customerEmail: text(input.customerEmail, 120)?.toLowerCase() || null,
        notes: text(input.notes, 500),
        orderId: link?.orderId || null,
        depositAmount: deposit > 0 ? deposit : null,
        depositStatus: deposit > 0 ? 'PENDIENTE' : null,
        trackingToken: randomBytes(24).toString('hex'),
        consents,
      }));
    };
    const saved = link ? await run(link.manager) : await this.dataSource.transaction(run);
    return this.publicView(saved, info.paymentInstructions, link?.manager);
  }

  /** Lo que ve el cliente de su reserva (sin datos de otras reservas). */
  private async publicView(r: TableReservation, paymentInstructions?: string | null, manager?: EntityManager) {
    const em = manager || this.dataSource.manager;
    const tables = await em.getRepository(DiningTable).find({ where: { tenantId: r.tenantId, id: In(r.tableIds) } });
    const order = r.orderId
      ? await em.query(`SELECT "orderCode", "trackingToken" FROM manufacturing.orders WHERE id = $1`, [r.orderId]).then((x: any[]) => x[0] || null)
      : null;
    return {
      code: r.code,
      token: r.trackingToken,
      tenantId: r.tenantId,
      status: r.status,
      statusLabel: STATUS_LABELS[r.status as ReservationStatus] || r.status,
      startAt: r.startAt,
      endAt: r.endAt,
      partySize: r.partySize,
      customerName: r.customerName,
      notes: r.notes,
      tables: tables.map((t) => ({ name: t.name, zone: t.zone })),
      deposit: r.depositAmount ? {
        amount: Number(r.depositAmount),
        status: r.depositStatus,
        proofUrl: r.depositProofUrl,
        reference: r.depositReference,
        instructions: paymentInstructions ?? null,
      } : null,
      order: order ? { code: order.orderCode, token: order.trackingToken } : null,
      canCancel: customerMayCancel(r.status as ReservationStatus, r.startAt, new Date()),
    };
  }

  private async byToken(token: string) {
    const t = String(token || '');
    if (!/^[a-f0-9]{48}$/.test(t)) throw new NotFoundException('Reserva no encontrada.');
    const r = await this.reservations.findOne({ where: { trackingToken: t } });
    if (!r) throw new NotFoundException('Reserva no encontrada.');
    return r;
  }

  async viewByToken(token: string) {
    const r = await this.byToken(token);
    const info = r.depositAmount ? await this.publicInfo(r.tenantId) : null;
    return this.publicView(r, info?.paymentInstructions);
  }

  async cancelByToken(token: string, now = new Date()) {
    const r = await this.byToken(token);
    if (!customerMayCancel(r.status as ReservationStatus, r.startAt, now)) throw new BadRequestException('Esta reserva ya no se puede cancelar.');
    // Con pedido anticipado, la cancelación del pedido la hace el negocio (puede haber pagos)
    if (r.orderId) throw new BadRequestException('Tu reserva tiene un pedido: para cancelarla escríbele a la tienda.');
    r.status = 'CANCELLED';
    r.cancelledAt = now;
    r.cancelReason = 'Cancelada por el cliente desde la tienda';
    await this.reservations.save(r);
    return this.viewByToken(token);
  }

  /** El cliente sube el comprobante del anticipo (queda por verificar). */
  async depositProofByToken(token: string, file: Express.Multer.File | undefined, reference: unknown) {
    const r = await this.byToken(token);
    if (!r.depositAmount) throw new BadRequestException('Esta reserva no pide anticipo.');
    if (r.depositStatus === 'PAGADO') throw new BadRequestException('El anticipo ya está verificado.');
    if (!BLOCKING.includes(r.status as ReservationStatus)) throw new BadRequestException('Esta reserva ya no está activa.');
    if (!file || !PROOF_TYPES.includes(file.mimetype) || file.size > PROOF_MAX_BYTES) {
      throw new BadRequestException('Adjunta la foto del comprobante: JPG, PNG o WEBP de máximo 5 MB.');
    }
    const uploaded = await this.cloudinary.uploadImageFromBuffer(file.buffer, 'inout/reservation-deposits', r.tenantId);
    r.depositProofUrl = uploaded.secure_url;
    r.depositReference = text(reference, 100);
    r.depositStatus = 'POR_VERIFICAR';
    await this.reservations.save(r);
    return this.viewByToken(token);
  }

  /** El negocio verifica el anticipo: aprobado confirma la reserva; rechazado, el cliente vuelve a subirlo. */
  async reviewDeposit(tenantId: string, id: string, approve: boolean) {
    const r = await this.reservations.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Reserva no encontrada.');
    if (!r.depositAmount) throw new BadRequestException('Esta reserva no pide anticipo.');
    r.depositStatus = approve ? 'PAGADO' : 'RECHAZADO';
    if (approve && r.status === 'PENDING') r.status = 'CONFIRMED';
    return this.reservations.save(r);
  }

  /** Reserva de un pedido para comer en el local (seguimiento público del pedido). */
  async publicForOrder(tenantId: string, orderId: string) {
    const r = await this.reservations.findOne({ where: { tenantId, orderId } });
    if (!r) return null;
    const tables = await this.tables.find({ where: { tenantId, id: In(r.tableIds) } });
    return {
      code: r.code,
      token: r.trackingToken,
      status: r.status,
      statusLabel: STATUS_LABELS[r.status as ReservationStatus] || r.status,
      startAt: r.startAt,
      partySize: r.partySize,
      tables: tables.map((t) => t.name),
    };
  }

  /** Mesa de los pedidos para comer en el local (pantalla de cocina y pedidos). */
  async tableLabelsForOrders(tenantId: string, orderIds: string[]): Promise<Map<string, { table: string; code: string; startAt: Date }>> {
    const out = new Map<string, { table: string; code: string; startAt: Date }>();
    if (!orderIds.length) return out;
    const res = await this.reservations.find({ where: { tenantId, orderId: In(orderIds) } });
    if (!res.length) return out;
    const tables = await this.tables.find({ where: { tenantId, id: In([...new Set(res.flatMap((r) => r.tableIds))]) } });
    const name = new Map(tables.map((t) => [t.id, t.name]));
    for (const r of res) {
      if (r.orderId) out.set(r.orderId, { table: r.tableIds.map((id) => name.get(id) || 'Mesa').join(' + '), code: r.code, startAt: r.startAt });
    }
    return out;
  }

  // ─── Apoyo ───

  /** Una reserva a la vez por negocio: evita dos reservas en la misma mesa y hora. */
  private async lock(manager: EntityManager, tenantId: string) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dining:${tenantId}`]);
  }

  private async checkTables(manager: EntityManager, tenantId: string, raw: unknown): Promise<string[]> {
    const ids = [...new Set((Array.isArray(raw) ? raw : []).map((x) => String(x)))];
    if (!ids.length) throw new BadRequestException('Elige la mesa.');
    if (ids.length > 6) throw new BadRequestException('Se pueden unir hasta 6 mesas.');
    const found = await manager.getRepository(DiningTable).find({ where: { tenantId, active: true, id: In(ids) } });
    if (found.length !== ids.length) throw new BadRequestException('Alguna de las mesas no existe.');
    return ids;
  }

  private async assertFree(manager: EntityManager, tenantId: string, tableIds: string[], start: Date, end: Date, now: Date, excludeId?: string) {
    const around = await manager.getRepository(TableReservation)
      .createQueryBuilder('r')
      .where('r.tenantId = :tenantId', { tenantId })
      .andWhere('r.status IN (:...st)', { st: BLOCKING })
      .andWhere('r.startAt < :end', { end })
      .getMany();
    const clash = findConflict(tableIds, start, end, around as unknown as ReservationLike[], now, excludeId);
    if (clash) {
      const c = clash as unknown as TableReservation;
      const hour = c.startAt.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
      throw new BadRequestException(`La mesa está ocupada a esa hora: ${c.code} de ${c.customerName} (${hour}).`);
    }
  }
}

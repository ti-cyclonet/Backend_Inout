import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import { DiningTable } from './entities/dining-table.entity';
import { TableReservation } from './entities/table-reservation.entity';
import { DiningSettingsEntity } from './entities/dining-settings.entity';
import { MarketplaceConfig } from '../marketplace-config/entities/marketplace-config.entity';
import { BusinessModulesService } from '../business-modules/business-modules.service';
import { bogotaDate, bogotaToUtc, resolveScheduling } from '../orders/scheduling';
import {
  BLOCKING, DiningSettings, ReservationLike, ReservationStatus, assertTransition, diningSlots, findConflict,
  nextReservationCode, resolveDiningSettings, validateDiningSettings, validateTable,
} from './dining-rules';

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

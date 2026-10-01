import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Promotion, PromotionTarget } from './entities/promotion.entity';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { bogotaMoment, isPromotionLive } from './promotion-engine';
import { PricingService, toRule } from './pricing.service';
import { Product } from '../products/entities/product.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { Combo } from '../combos/entities/combo.entity';

/** Estado mostrado: inactiva, programada, vencida, en curso ahora o vigente (fuera de su día/hora). */
export type PromotionState = 'inactive' | 'scheduled' | 'expired' | 'live' | 'waiting';

const num = (v: any) => Number(v) || 0;

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion) private readonly repo: Repository<Promotion>,
    private readonly pricing: PricingService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(tenantId: string) {
    const list = await this.repo.find({ where: { strTenantId: tenantId }, order: { dtmCreationDate: 'DESC' } });
    const names = await this.targetNames(tenantId, list.flatMap((p) => p.targets || []));
    return list.map((p) => this.view(p, names));
  }

  async findOne(tenantId: string, id: string) {
    const p = await this.get(tenantId, id);
    return this.view(p, await this.targetNames(tenantId, p.targets || []));
  }

  /** Público (MarketPlace): promociones en curso ahora en el MarketPlace, para mostrar etiquetas. */
  async findLiveForMarketplace(tenantId: string) {
    const at = bogotaMoment();
    const list = await this.repo.find({ where: { strTenantId: tenantId, strStatus: 'active' } });
    return list
      .filter((p) => isPromotionLive(toRule(p), at, 'MARKETPLACE'))
      .map((p) => ({
        strId: p.strId,
        strName: p.strName,
        discountType: p.strDiscountType,
        value: num(p.fltValue),
        scope: p.strScope,
        targets: p.targets || [],
        label: this.label(p),
        endDate: p.dtmEndDate,
        timeTo: p.strTimeTo,
      }));
  }

  async create(tenantId: string, dto: CreatePromotionDto) {
    const data = await this.validate(tenantId, {
      name: dto.name,
      description: dto.description,
      discountType: dto.discountType,
      value: dto.value,
      scope: dto.scope,
      targets: dto.targets || [],
      channel: dto.channel || 'ALL',
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      weekdays: dto.weekdays ?? null,
      timeFrom: dto.timeFrom ?? null,
      timeTo: dto.timeTo ?? null,
    });
    const saved = await this.repo.save(this.repo.create({ strTenantId: tenantId, strStatus: 'active', ...data }));
    return this.findOne(tenantId, saved.strId);
  }

  async update(tenantId: string, id: string, dto: UpdatePromotionDto) {
    const p = await this.get(tenantId, id);
    const merged = {
      name: dto.name ?? p.strName,
      description: dto.description !== undefined ? dto.description : p.strDescription,
      discountType: dto.discountType ?? p.strDiscountType,
      value: dto.value ?? num(p.fltValue),
      scope: dto.scope ?? p.strScope,
      targets: dto.targets ?? p.targets ?? [],
      channel: dto.channel ?? p.strChannel,
      startDate: dto.startDate ?? String(p.dtmStartDate).slice(0, 10),
      endDate: dto.endDate !== undefined ? dto.endDate : p.dtmEndDate,
      weekdays: dto.weekdays !== undefined ? dto.weekdays : p.weekdays,
      timeFrom: dto.timeFrom !== undefined ? dto.timeFrom : p.strTimeFrom,
      timeTo: dto.timeTo !== undefined ? dto.timeTo : p.strTimeTo,
    };
    const data = await this.validate(tenantId, merged);
    Object.assign(p, data);
    if (dto.status) p.strStatus = dto.status;
    await this.repo.save(p);
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    // Los pedidos guardan la foto de la promoción: borrarla no altera el historial
    await this.repo.delete({ strId: id, strTenantId: tenantId });
    return { deleted: true };
  }

  // ── Auxiliares ─────────────────────────────────────────────────────────

  private async get(tenantId: string, id: string) {
    const p = await this.repo.findOne({ where: { strId: id, strTenantId: tenantId } });
    if (!p) throw new NotFoundException('Promoción no encontrada');
    return p;
  }

  private async validate(tenantId: string, d: {
    name: string; description?: string | null; discountType: 'PERCENT' | 'FIXED'; value: number; scope: 'ITEMS' | 'ALL';
    targets: PromotionTarget[]; channel: 'ALL' | 'POS' | 'MARKETPLACE'; startDate: string; endDate: string | null;
    weekdays: number[] | null; timeFrom: string | null; timeTo: string | null;
  }) {
    const name = d.name?.trim();
    if (!name) throw new BadRequestException('La promoción necesita un nombre.');
    if (!(d.value > 0)) throw new BadRequestException('El descuento debe ser mayor a cero.');
    if (d.discountType === 'PERCENT') {
      if (d.value > 100) throw new BadRequestException('El porcentaje no puede pasar de 100.');
      const max = await this.pricing.maxDiscountPercent(tenantId);
      if (d.value > max) {
        throw new BadRequestException(`El porcentaje (${d.value}%) supera el descuento máximo permitido en el período (${max}%).`);
      }
    }
    const startDate = d.startDate.slice(0, 10);
    const endDate = d.endDate ? d.endDate.slice(0, 10) : null;
    if (endDate && endDate < startDate) throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    if (!!d.timeFrom !== !!d.timeTo) throw new BadRequestException('Indica la hora de inicio y la de fin de la franja (o ninguna).');
    if (d.timeFrom && d.timeFrom === d.timeTo) throw new BadRequestException('La franja horaria no puede empezar y terminar a la misma hora.');
    const weekdays = d.weekdays && d.weekdays.length ? [...new Set(d.weekdays)].sort() : null;

    let targets: PromotionTarget[] = [];
    if (d.scope === 'ITEMS') {
      targets = this.uniqueTargets(d.targets);
      if (targets.length === 0) throw new BadRequestException('Elige a qué productos, categorías o combos aplica la promoción.');
      await this.assertTargetsExist(tenantId, targets);
    }

    return {
      strName: name,
      strDescription: d.description?.trim() || null,
      strDiscountType: d.discountType,
      fltValue: Math.round(d.value * 100) / 100,
      strScope: d.scope,
      targets,
      strChannel: d.channel,
      dtmStartDate: startDate,
      dtmEndDate: endDate,
      weekdays,
      strTimeFrom: d.timeFrom || null,
      strTimeTo: d.timeTo || null,
    };
  }

  private uniqueTargets(targets: PromotionTarget[]): PromotionTarget[] {
    const seen = new Set<string>();
    return (targets || []).filter((t) => {
      const key = `${t.type}:${t.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async assertTargetsExist(tenantId: string, targets: PromotionTarget[]) {
    const names = await this.targetNames(tenantId, targets);
    const missing = targets.filter((t) => !names.has(`${t.type}:${t.id}`));
    if (missing.length) throw new BadRequestException('Algunos de los ítems elegidos ya no existen. Revisa la selección.');
  }

  /** Nombres de los destinos (para mostrar y validar), por "tipo:id". */
  private async targetNames(tenantId: string, targets: PromotionTarget[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = (type: string) => [...new Set(targets.filter((t) => t.type === type).map((t) => t.id))];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const load = async (type: string, Entity: any, label: (e: any) => string, extra: (e: any) => boolean = () => true) => {
      const list = ids(type).filter((id) => uuid.test(id));
      if (!list.length) return;
      const rows: any[] = await this.dataSource.manager.find(Entity, { where: { strId: In(list), strTenantId: tenantId } });
      for (const r of rows) if (extra(r)) out.set(`${type}:${r.strId}`, label(r));
    };
    await load('product', Product, (e) => e.strName);
    await load('material', Material, (e) => `${e.strName} - ${e.strSalePresentation || ''}`.trim());
    await load('material_t', MaterialT, (e) => `${e.strName} - ${e.strSalePresentation || ''}`.trim());
    await load('kit', Combo, (e) => e.strName, (e) => e.strType === 'KIT');
    await load('combo', Combo, (e) => e.strName, (e) => e.strType === 'VIRTUAL');
    const categoryIds = ids('category').map(Number).filter((n) => Number.isInteger(n));
    if (categoryIds.length) {
      const rows = await this.dataSource.query(
        `SELECT id, name FROM manufacturing.categories WHERE id = ANY($1::int[]) AND "tenantId" = $2`,
        [categoryIds, tenantId],
      ).catch(() => []);
      for (const r of rows) out.set(`category:${r.id}`, r.name);
    }
    return out;
  }

  private state(p: Promotion): PromotionState {
    if (p.strStatus !== 'active') return 'inactive';
    const at = bogotaMoment();
    const start = String(p.dtmStartDate).slice(0, 10);
    const end = p.dtmEndDate ? String(p.dtmEndDate).slice(0, 10) : null;
    if (at.date < start) return 'scheduled';
    if (end && at.date > end) return 'expired';
    const rule = toRule(p);
    return isPromotionLive(rule, at, 'POS') || isPromotionLive(rule, at, 'MARKETPLACE') ? 'live' : 'waiting';
  }

  /** Etiqueta corta: "-20%" o "-$3.000". */
  private label(p: Promotion): string {
    const v = num(p.fltValue);
    return p.strDiscountType === 'PERCENT' ? `-${v}%` : `-$${Math.round(v).toLocaleString('es-CO')}`;
  }

  private view(p: Promotion, names: Map<string, string>) {
    return {
      strId: p.strId,
      strName: p.strName,
      strDescription: p.strDescription,
      strStatus: p.strStatus,
      state: this.state(p),
      label: this.label(p),
      discountType: p.strDiscountType,
      value: num(p.fltValue),
      scope: p.strScope,
      targets: (p.targets || []).map((t) => ({ ...t, name: names.get(`${t.type}:${t.id}`) || null })),
      channel: p.strChannel,
      startDate: String(p.dtmStartDate).slice(0, 10),
      endDate: p.dtmEndDate ? String(p.dtmEndDate).slice(0, 10) : null,
      weekdays: p.weekdays,
      timeFrom: p.strTimeFrom,
      timeTo: p.strTimeTo,
      dtmCreationDate: p.dtmCreationDate,
      dtmUpdateDate: p.dtmUpdateDate,
    };
  }
}

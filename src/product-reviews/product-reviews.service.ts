import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ProductReview } from './entities/product-review.entity';
import { MarketplaceConfigService } from '../marketplace-config/marketplace-config.service';
import {
  REVIEW_LIMITS, REVIEW_STATUSES, RatingSummary, ReviewInput, ReviewSettings, ReviewStatus,
  initialStatus, publicAuthorName, resolveReviewSettings, summarize, validateReviewInput, validateReviewUpdate,
} from './product-reviews-rules';

const ID = /^[0-9a-fA-F-]{8,64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface VisitorMeta { ipAddress?: string; userAgent?: string }

/** Lo que la tienda muestra de cada opinión (sin teléfono ni nombre completo). */
export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  author: string;
  createdAt: Date;
  reply: string | null;
  repliedAt: Date | null;
}

@Injectable()
export class ProductReviewsService {
  constructor(
    @InjectRepository(ProductReview) private readonly reviews: Repository<ProductReview>,
    private readonly marketplaceConfig: MarketplaceConfigService,
  ) {}

  // ── Configuración de la tienda ──

  async settings(tenantId: string): Promise<ReviewSettings> {
    const config = await this.marketplaceConfig.getConfig(tenantId);
    return resolveReviewSettings(config?.reviews);
  }

  async updateSettings(tenantId: string, body: any): Promise<ReviewSettings> {
    const config = await this.marketplaceConfig.configFor(tenantId);
    const next = resolveReviewSettings({ ...resolveReviewSettings(config.reviews), ...(body || {}) });
    config.reviews = next as any;
    await this.marketplaceConfig.save(config);
    return next;
  }

  // ── Tienda (público) ──

  /** { itemId: { average, count } } de las opiniones publicadas: estrellas en el catálogo. */
  async publicSummary(tenantId: string): Promise<Record<string, RatingSummary>> {
    this.assertId(tenantId, 'Tienda inválida.');
    if (!(await this.settings(tenantId)).enabled) return {};
    const rows: { itemId: string; avg: string; n: string }[] = await this.reviews
      .createQueryBuilder('r')
      .select('r.itemId', 'itemId')
      .addSelect('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'n')
      .where('r.tenantId = :tenantId AND r.status = :status', { tenantId, status: 'PUBLISHED' })
      .groupBy('r.itemId')
      .getRawMany();
    const out: Record<string, RatingSummary> = {};
    for (const r of rows) {
      out[r.itemId] = { average: Math.round(Number(r.avg) * 10) / 10, count: Number(r.n) || 0 };
    }
    return out;
  }

  /** Opiniones publicadas de un ítem, de la más reciente a la más antigua, con su resumen. */
  async publicList(tenantId: string, itemId: string) {
    this.assertId(tenantId, 'Tienda inválida.');
    this.assertId(itemId, 'Ítem inválido.');
    const settings = await this.settings(tenantId);
    if (!settings.enabled) return { enabled: false, summary: summarize([]), reviews: [] as PublicReview[] };
    const [ratings, latest] = await Promise.all([
      this.reviews.find({ where: { tenantId, itemId, status: 'PUBLISHED' }, select: ['rating'] }),
      this.reviews.find({
        where: { tenantId, itemId, status: 'PUBLISHED' },
        order: { createdAt: 'DESC' },
        take: REVIEW_LIMITS.publicPage,
      }),
    ]);
    return {
      enabled: true,
      summary: summarize(ratings.map((r) => r.rating)),
      reviews: latest.map((r) => this.toPublic(r)),
    };
  }

  /** Un cliente deja su opinión desde la tienda. */
  async create(tenantId: string, itemId: string, input: ReviewInput, meta: VisitorMeta = {}) {
    this.assertId(tenantId, 'Tienda inválida.');
    this.assertId(itemId, 'Ítem inválido.');
    const settings = await this.settings(tenantId);
    if (!settings.enabled) throw new BadRequestException('Esta tienda no recibe opiniones.');
    const data = validateReviewInput(input);
    const itemName = await this.itemName(tenantId, itemId);
    if (!itemName) throw new NotFoundException('Ítem no encontrado.');

    const visitorHash = meta.ipAddress ? this.hash(`${tenantId}:${meta.ipAddress}`) : null;
    if (visitorHash) {
      const since = new Date(Date.now() - DAY_MS);
      const [today, sameItem] = await Promise.all([
        this.reviews.count({ where: { tenantId, visitorHash, createdAt: MoreThan(since) } }),
        this.reviews.count({ where: { tenantId, itemId, visitorHash, createdAt: MoreThan(since) } }),
      ]);
      if (sameItem > 0) throw new HttpException('Ya enviaste tu opinión sobre este producto. ¡Gracias!', HttpStatus.TOO_MANY_REQUESTS);
      if (today >= REVIEW_LIMITS.perVisitorPerDay) {
        throw new HttpException('Enviaste varias opiniones hoy. Intenta de nuevo mañana.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const status = initialStatus(settings);
    const now = new Date();
    await this.reviews.save(this.reviews.create({
      tenantId,
      itemId,
      itemName: itemName.slice(0, 255),
      ...data,
      status,
      publishedAt: status === 'PUBLISHED' ? now : null,
      visitorHash,
      consents: { publish: true, acceptedAt: now.toISOString(), userAgent: String(meta.userAgent || '').slice(0, 300) || null },
    }));
    return {
      status,
      message: status === 'PUBLISHED'
        ? '¡Gracias! Tu opinión ya está publicada.'
        : '¡Gracias! Tu opinión se publicará cuando la tienda la revise.',
    };
  }

  // ── Panel del negocio ──

  async adminList(tenantId: string, status?: string) {
    const where: any = { tenantId };
    if (status) {
      if (!REVIEW_STATUSES.includes(status as ReviewStatus)) throw new BadRequestException('Estado no válido.');
      where.status = status;
    }
    const [items, counts] = await Promise.all([
      this.reviews.find({ where, order: { createdAt: 'DESC' }, take: 200 }),
      this.reviews
        .createQueryBuilder('r')
        .select('r.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .where('r.tenantId = :tenantId', { tenantId })
        .groupBy('r.status')
        .getRawMany(),
    ]);
    const byStatus: Record<string, number> = { PENDING: 0, PUBLISHED: 0, HIDDEN: 0 };
    for (const c of counts) byStatus[c.status] = Number(c.n) || 0;
    return {
      counts: byStatus,
      reviews: items.map((r) => ({
        id: r.id,
        itemId: r.itemId,
        itemName: r.itemName,
        rating: r.rating,
        comment: r.comment,
        authorName: r.authorName,
        authorPhone: r.authorPhone,
        status: r.status,
        reply: r.reply,
        repliedAt: r.repliedAt,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Publicar, ocultar o volver a pendiente, y/o responder. */
  async update(tenantId: string, id: string, body: any) {
    this.assertId(id, 'Opinión inválida.');
    const change = validateReviewUpdate(body);
    const review = await this.reviews.findOne({ where: { id, tenantId } });
    if (!review) throw new NotFoundException('Opinión no encontrada.');
    if (change.status) {
      review.status = change.status;
      if (change.status === 'PUBLISHED' && !review.publishedAt) review.publishedAt = new Date();
    }
    if (change.reply !== undefined) {
      review.reply = change.reply;
      review.repliedAt = change.reply ? new Date() : null;
    }
    await this.reviews.save(review);
    return { id: review.id, status: review.status, reply: review.reply, repliedAt: review.repliedAt, publishedAt: review.publishedAt };
  }

  async remove(tenantId: string, id: string) {
    this.assertId(id, 'Opinión inválida.');
    const res = await this.reviews.delete({ id, tenantId });
    if (!res.affected) throw new NotFoundException('Opinión no encontrada.');
    return { deleted: true };
  }

  // ── Apoyo ──

  private toPublic(r: ProductReview): PublicReview {
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      author: publicAuthorName(r.authorName),
      createdAt: r.createdAt,
      reply: r.reply,
      repliedAt: r.repliedAt,
    };
  }

  /** Nombre del ítem si es de esa tienda (producto, material o combo); null si no existe. */
  private async itemName(tenantId: string, itemId: string): Promise<string | null> {
    const rows: { name: string }[] = await this.reviews.query(
      `SELECT "strName" AS name FROM manufacturing.products  WHERE "strId"::text = $2 AND "strTenantId" = $1
       UNION ALL SELECT "strName" FROM manufacturing.materials WHERE "strId"::text = $2 AND "strTenantId" = $1
       UNION ALL SELECT "strName" FROM manufacturing.combos    WHERE "strId"::text = $2 AND "strTenantId" = $1
       LIMIT 1`,
      [tenantId, itemId],
    );
    return rows[0]?.name ?? null;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private assertId(value: string, message: string) {
    if (!ID.test(value || '')) throw new BadRequestException(message);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceItemStat } from './entities/marketplace-item-stat.entity';

export interface EstadisticaItem { views: number; sold: number }

const ID = /^[0-9a-fA-F-]{8,64}$/;

/**
 * Vistas y unidades vendidas de cada ítem de la tienda en línea. Antes el
 * MarketPlace inventaba esos números con Math.random() en cada carga.
 */
@Injectable()
export class MarketplaceStatsService {
  constructor(
    @InjectRepository(MarketplaceItemStat)
    private readonly stats: Repository<MarketplaceItemStat>,
  ) {}

  /**
   * Suma una vista al detalle de un ítem. Solo si el ítem es de esa tienda
   * (producto, material o combo): así nadie llena la tabla con ids inventados.
   */
  async registrarVista(tenantId: string, itemId: string): Promise<void> {
    if (!ID.test(tenantId || '') || !ID.test(itemId || '')) throw new BadRequestException('Ítem inválido.');
    const [{ existe }] = await this.stats.query(
      `SELECT EXISTS (
         SELECT 1 FROM manufacturing.products  WHERE "strId"::text = $2 AND "strTenantId" = $1
         UNION ALL SELECT 1 FROM manufacturing.materials WHERE "strId"::text = $2 AND "strTenantId" = $1
         UNION ALL SELECT 1 FROM manufacturing.combos    WHERE "strId"::text = $2 AND "strTenantId" = $1
       ) AS existe`,
      [tenantId, itemId],
    );
    if (!existe) throw new NotFoundException('Ítem no encontrado.');
    await this.stats.query(
      `INSERT INTO manufacturing.marketplace_item_stats ("strTenantId", "strItemId", "ingViews", "dtmUpdated")
       VALUES ($1, $2, 1, now())
       ON CONFLICT ("strTenantId", "strItemId") DO UPDATE
         SET "ingViews" = marketplace_item_stats."ingViews" + 1, "dtmUpdated" = now()`,
      [tenantId, itemId],
    );
  }

  /**
   * { itemId: { views, sold } } de toda la tienda. Vendidas = unidades de las
   * ventas reales: las líneas de items[] y, en ventas viejas sin items[], el
   * producto y la cantidad de la cabecera.
   */
  async estadisticas(tenantId: string): Promise<Record<string, EstadisticaItem>> {
    if (!ID.test(tenantId || '')) throw new BadRequestException('Tienda inválida.');
    const [vistas, vendidas] = await Promise.all([
      this.stats.query(
        `SELECT "strItemId" AS id, "ingViews" AS n FROM manufacturing.marketplace_item_stats WHERE "strTenantId" = $1`,
        [tenantId],
      ),
      this.stats.query(
        `SELECT id, SUM(cantidad) AS n FROM (
           SELECT linea->>'productId' AS id, COALESCE((linea->>'quantity')::numeric, 0) AS cantidad
             FROM manufacturing.sales s
             CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END) AS linea
            WHERE s."strTenantId" = $1
           UNION ALL
           SELECT s."strProductId" AS id, s."fltQuantity" AS cantidad
             FROM manufacturing.sales s
            WHERE s."strTenantId" = $1
              AND (s.items IS NULL OR jsonb_typeof(s.items) <> 'array' OR jsonb_array_length(s.items) = 0)
         ) t
         WHERE id IS NOT NULL
         GROUP BY id`,
        [tenantId],
      ),
    ]);
    const r: Record<string, EstadisticaItem> = {};
    const de = (id: string) => (r[id] ??= { views: 0, sold: 0 });
    for (const v of vistas) de(v.id).views = Number(v.n) || 0;
    for (const v of vendidas) de(v.id).sold = Math.round(Number(v.n) || 0);
    return r;
  }
}

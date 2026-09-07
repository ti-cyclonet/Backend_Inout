-- =============================================================================
-- RESET COMPLETO — InoutDB   (schema: manufacturing)
-- =============================================================================
-- ⚠️  DESTRUCTIVO E IRREVERSIBLE. Borra TODOS los datos de InOut.
--
-- IMPORTANTE: InOut guarda TODAS sus tablas en el schema "manufacturing"
--             (NO en "public"). Los parámetros/periodos vienen de Authoriza vía
--             HTTP, así que este reset no los afecta.
--
-- ORM: TypeORM con synchronize:true  →  al REINICIAR el contenedor, TypeORM
--      recrea el esquema/tablas (y main.ts hace CREATE SCHEMA IF NOT EXISTS
--      manufacturing). No hay seeds de catálogo: la base queda vacía y lista.
--
-- Verifica primero que estás en la base correcta:
--     SELECT current_database();   -- debe decir InoutDB
-- =============================================================================

-- No hay FKs circulares. TRUNCATE ... CASCADE limpia todo de una vez y reinicia
-- las identidades. Los nombres "materials-t" (guion) y "compositionOne"
-- (camelCase) DEBEN ir entre comillas dobles y calificados con el schema.

TRUNCATE TABLE
  manufacturing.warehouse_locations,
  manufacturing.stock_transfers,
  manufacturing.physical_counts,
  manufacturing.inventory_movements,
  manufacturing.purchase_records,
  manufacturing.product_composition,
  manufacturing.composition_two,
  manufacturing.composition_three,
  manufacturing.product_productions,
  manufacturing."compositionOne",
  manufacturing.sales,
  manufacturing.orders,
  manufacturing.marketplace_config,
  manufacturing.usage_counters,
  manufacturing.training_sessions,
  manufacturing.images,
  manufacturing.activities,
  manufacturing.warehouses,
  manufacturing.products,
  manufacturing."materials-t",
  manufacturing.materials,
  manufacturing.suppliers,
  manufacturing.customer,
  manufacturing.categories
RESTART IDENTITY CASCADE;

-- Tras ejecutar, reinicia el contenedor para asegurar el esquema sincronizado
-- (ver README.md). No requiere migraciones ni seed.

-- =============================================================================
-- RESET COMPLETO — InoutDB   (PRODUCCIÓN, schema: manufacturing)
-- =============================================================================
-- ⚠️  DESTRUCTIVO E IRREVERSIBLE. Borra TODA la data generada por los clientes
--     de InOut en producción (categorías, materiales, productos, órdenes,
--     ventas, compras, bodegas, movimientos, clientes, config de marketplace,
--     etc.) para dejar la base lista para operar desde cero.
--
-- IMPORTANTE: InOut guarda TODAS sus tablas en el schema "manufacturing"
--             (NO en "public"). Usuarios, roles, planes y facturación viven en
--             Authoriza, en OTRA base de datos — este script no los toca.
--
-- ORM: TypeORM con synchronize:true → si además quieres recrear el esquema
--      desde cero (no solo vaciar), puedes hacer DROP SCHEMA manufacturing
--      CASCADE y reiniciar el contenedor (main.ts hace
--      CREATE SCHEMA IF NOT EXISTS manufacturing y synchronize recrea las
--      tablas). Para el caso normal ("vaciar y volver a operar"), el TRUNCATE
--      de este script es suficiente y no requiere reiniciar el contenedor.
--
-- Este script requiere psql (usa \prompt/\if para pedir confirmación escrita
-- antes de borrar). TablePlus/DBeaver no ejecutan meta-comandos de psql — para
-- algo tan destructivo, corre este archivo por terminal:
--
--   psql "host=<RDS_HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
--     -f reset-database.sql
--
-- ANTES de ejecutar, saca un backup:
--
--   pg_dump "host=<RDS_HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
--     --format=custom -f inout_prod_backup_$(date +%Y%m%d_%H%M).dump
--
-- Para restaurar ese backup si algo sale mal:
--
--   pg_restore --clean --if-exists \
--     -d "host=<RDS_HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
--     inout_prod_backup_YYYYMMDD_HHMM.dump
-- =============================================================================

\set ON_ERROR_STOP on

-- Freno de seguridad: aborta si no estás conectado a InoutDB (evita ejecutarlo
-- por error contra InoutDB_staging u otra base).
DO $$
BEGIN
  IF current_database() <> 'InoutDB' THEN
    RAISE EXCEPTION 'Conectado a la base "%", no a InoutDB. Abortando sin tocar nada.', current_database();
  END IF;
END $$;

\echo '=== Filas ANTES del reset (schema manufacturing) ==='
DO $$
DECLARE
    r RECORD;
    cnt bigint;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'manufacturing' ORDER BY tablename) LOOP
        EXECUTE format('SELECT count(*) FROM manufacturing.%I', r.tablename) INTO cnt;
        RAISE NOTICE '% -> % fila(s)', r.tablename, cnt;
    END LOOP;
END $$;

-- Confirmación explícita escrita a mano: cualquier otra respuesta cancela sin
-- cambiar nada.
\prompt 'Escribe RESETEAR (en mayúsculas) para borrar TODA la data de clientes en PRODUCCIÓN: ' confirm
SELECT :'confirm' = 'RESETEAR' AS ok \gset
\if :ok
\else
  \echo 'Cancelado: no se escribió la confirmación exacta. No se realizó ningún cambio.'
  \q
\endif

-- Trunca TODAS las tablas del schema manufacturing de una sola vez usando
-- CASCADE, descubriéndolas dinámicamente desde pg_tables — así no hace falta
-- mantener una lista a mano ni acertar el orden de FKs, y cubre tablas nuevas
-- que se agreguen a futuro. Varias entidades TypeORM usan casing especial
-- (p. ej. "compositionOne" camelCase, "materials-t" con guion): %I en el
-- format() de abajo las cita correctamente. RESTART IDENTITY reinicia también
-- las secuencias/identities de las tablas truncadas.
DO $$
DECLARE
    table_list text;
BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO table_list
    FROM pg_tables
    WHERE schemaname = 'manufacturing';

    IF table_list IS NULL THEN
        RAISE NOTICE 'No hay tablas en el schema manufacturing. Nada que truncar.';
        RETURN;
    END IF;

    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE 'Truncadas todas las tablas del schema manufacturing.';
END $$;

-- Reiniciar cualquier secuencia restante del schema (no ligada a una identity
-- de una tabla truncada) para garantizar un estado limpio desde 1.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT sequence_name
        FROM information_schema.sequences
        WHERE sequence_schema = 'manufacturing'
    ) LOOP
        EXECUTE 'ALTER SEQUENCE manufacturing.' || quote_ident(r.sequence_name) || ' RESTART WITH 1';
    END LOOP;
END $$;

\echo '=== Filas DESPUÉS del reset (deben ser todas 0) ==='
DO $$
DECLARE
    r RECORD;
    cnt bigint;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'manufacturing' ORDER BY tablename) LOOP
        EXECUTE format('SELECT count(*) FROM manufacturing.%I', r.tablename) INTO cnt;
        RAISE NOTICE '% -> % fila(s)', r.tablename, cnt;
    END LOOP;
END $$;

\echo '=== Listo. La base de InOut quedó vacía y lista para operar desde cero. ==='

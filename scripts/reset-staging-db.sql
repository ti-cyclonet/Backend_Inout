-- =============================================================================
-- RESET COMPLETO — InoutDB (staging / local)
-- Schema: manufacturing
--
-- Trunca TODAS las tablas del schema manufacturing de una sola vez usando
-- CASCADE, de modo que NO hay que acertar el orden de dependencias (FK) ni el
-- nombre exacto de cada tabla. Esto es importante porque varias entidades
-- TypeORM usan un casing especial que rompe los DELETE manuales, p. ej.
-- "compositionOne" (camelCase) y "materials-t" (con guion). Descubrir las
-- tablas dinamicamente desde pg_tables cubre TODAS las tablas presentes
-- (incluidas orders, warehouses, warehouse_locations, stock_transfers,
-- physical_counts) y cualquier tabla futura sin tener que mantener una lista.
-- RESTART IDENTITY reinicia las secuencias/identidades de las tablas truncadas.
--
-- USO EN TablePlus:
--   1. Conectate a la base de datos local/staging de InOut.
--   2. Abre una pestana de SQL (Cmd/Ctrl + T).
--   3. Pega este script y ejecutalo (Cmd/Ctrl + Enter) o "Run Current".
--
-- ⚠️  BORRA TODOS LOS DATOS del schema manufacturing. Verifica que estas
--     conectado a la base local/staging de InOut y NO a produccion antes de
--     ejecutar.
-- =============================================================================

DO $$
DECLARE
    table_list text;
BEGIN
    -- Reunir todas las tablas base del schema manufacturing, calificadas y con
    -- comillas (%I) para respetar el casing especial de los nombres.
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO table_list
    FROM pg_tables
    WHERE schemaname = 'manufacturing';

    IF table_list IS NULL THEN
        RAISE NOTICE 'No hay tablas en el schema manufacturing. Nada que truncar.';
        RETURN;
    END IF;

    -- TRUNCATE con CASCADE resuelve las FKs automaticamente; RESTART IDENTITY
    -- reinicia las columnas identity/serial de las tablas truncadas.
    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';

    RAISE NOTICE 'Truncadas todas las tablas del schema manufacturing.';
END $$;

-- Reiniciar CUALQUIER secuencia restante del schema manufacturing (p. ej.
-- secuencias no ligadas a una identity de tabla truncada) para garantizar un
-- estado limpio desde 1.
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

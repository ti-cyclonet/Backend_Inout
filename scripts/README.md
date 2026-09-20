# Reset completo de la base de datos — InOut

Script para **vaciar por completo** la base de datos de InOut.

> ⚠️ **Operación destructiva e irreversible.** Borra todos los materiales,
> productos, ventas, órdenes, bodegas, movimientos, etc. En producción, idealmente
> con respaldo previo.

## Cómo funciona

InOut usa **TypeORM con `synchronize: true`** y guarda **todas sus tablas en el
schema `manufacturing`** (no en `public`).

- El **esquema/tablas** los mantiene TypeORM desde las entidades: se
  recrean/sincronizan al arrancar el contenedor. Además `src/main.ts` ejecuta
  `CREATE SCHEMA IF NOT EXISTS manufacturing` en el arranque.
- **No hay seeds de catálogo.** Los parámetros y periodos provienen de Authoriza
  vía HTTP, no de la BD de InOut. Por eso, tras vaciar, la base queda limpia y
  lista sin necesidad de repoblar nada.

Reset de **2 pasos**: vaciar datos (SQL) y reiniciar el contenedor.

## Archivos

- `reset-database.sql` — reset de **producción**. Descubre dinámicamente todas
  las tablas del schema `manufacturing` (vía `pg_tables`, no depende de una
  lista fija) y hace `TRUNCATE ... RESTART IDENTITY CASCADE` de una sola vez.
  No hay FKs circulares. Incluye un freno de seguridad (aborta si no estás
  conectado a `InoutDB`) y pide escribir `RESETEAR` a mano antes de borrar
  nada — por eso **requiere psql**, no TablePlus/DBeaver (esas herramientas no
  ejecutan meta-comandos `\prompt`/`\if` de psql).
- `reset-staging-db.sql` — misma lógica de descubrimiento dinámico, sin el
  freno de confirmación (pensado para staging/local, donde el costo de un
  error es bajo). Se puede correr desde TablePlus.

## Pasos (producción)

### 0. Backup (obligatorio)

```bash
pg_dump "host=<RDS_HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
  --format=custom -f inout_prod_backup_$(date +%Y%m%d_%H%M).dump
```

Para restaurarlo si algo sale mal:

```bash
pg_restore --clean --if-exists \
  -d "host=<RDS_HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
  inout_prod_backup_YYYYMMDD_HHMM.dump
```

### 1. Ejecutar el SQL (por terminal, con psql)

```bash
psql "host=<RDS_HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
  -f reset-database.sql
```

El script primero verifica que estás conectado a `InoutDB` (aborta si no),
muestra el conteo de filas por tabla ANTES de borrar, pide que escribas
`RESETEAR` para continuar (cualquier otra cosa cancela sin tocar nada), trunca
todo, y vuelve a mostrar el conteo (debe quedar en 0 en todas las tablas).

### 2. Reiniciar el contenedor (asegura el esquema sincronizado)

```bash
sudo docker restart cyclonet-inout-api
sudo docker logs cyclonet-inout-api --tail 40
```

## Entornos

| Entorno | Base de datos | Schema | Contenedor |
|---|---|---|---|
| Producción | `InoutDB` | `manufacturing` | `cyclonet-inout-api` |
| Staging | `InoutDB_staging` | `manufacturing` | (según despliegue de staging) |

## Notas

- Si prefieres empezar el esquema totalmente desde cero (no solo vaciar datos),
  puedes hacer `DROP SCHEMA manufacturing CASCADE;` y reiniciar el contenedor:
  `main.ts` recrea el schema y `synchronize` recrea las tablas. El `TRUNCATE` es
  suficiente para el caso normal de "datos corruptos".

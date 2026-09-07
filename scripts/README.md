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

- `reset-database.sql` — `TRUNCATE ... RESTART IDENTITY CASCADE` de las 24 tablas
  del schema `manufacturing`. No hay FKs circulares. Cuidado: los nombres
  `"materials-t"` (con guion) y `"compositionOne"` (camelCase) van entre comillas.

## Pasos

### 1. Ejecutar el SQL (TablePlus o psql)

Conéctate a la base de **InOut** y **verifica primero**:

```sql
SELECT current_database();   -- debe decir InoutDB (o InoutDB_staging en staging)
```

Ejecuta el contenido de `reset-database.sql`.

> Nota TablePlus: si tu conexión no tiene el `search_path` en `manufacturing`,
> las tablas de este script funcionan igual porque van calificadas con el schema
> (`manufacturing.<tabla>`).

Alternativa por consola:

```bash
psql "host=<HOST> port=5432 dbname=InoutDB user=cyclonet_admin sslmode=require" \
  -f reset-database.sql
```

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

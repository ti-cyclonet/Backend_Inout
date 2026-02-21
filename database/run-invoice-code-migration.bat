@echo off
echo Ejecutando migracion para agregar codigo de factura...
echo.

REM Configuracion de la base de datos
set PGHOST=localhost
set PGPORT=5432
set PGDATABASE=inout_db
set PGUSER=postgres
set PGPASSWORD=postgres

REM Ejecutar el script SQL
psql -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% -f add-invoice-code.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Migracion completada exitosamente!
) else (
    echo.
    echo Error al ejecutar la migracion.
)

pause

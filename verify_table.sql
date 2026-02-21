-- Verificar en qué esquema está la tabla marketplace_config
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename = 'marketplace_config';

-- Ver todas las tablas del esquema public
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Verificar datos en la tabla
SELECT * FROM marketplace_config;
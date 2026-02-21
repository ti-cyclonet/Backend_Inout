-- Crear esquema manufacturing si no existe
CREATE SCHEMA IF NOT EXISTS manufacturing;

-- Crear tabla marketplace_config en esquema manufacturing
CREATE TABLE IF NOT EXISTS manufacturing.marketplace_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenantId" VARCHAR(255) NOT NULL,
    "selectedProductIds" JSON NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índice para tenantId
CREATE INDEX IF NOT EXISTS "IDX_MARKETPLACE_CONFIG_TENANT" ON manufacturing.marketplace_config ("tenantId");

-- Insertar datos de ejemplo para testing
INSERT INTO manufacturing.marketplace_config (id, "tenantId", "selectedProductIds", "createdAt", "updatedAt") 
VALUES (
    uuid_generate_v4(),
    '3b0fa0d3-4993-4c50-bb38-f7333873b1ca',
    '["1", "2"]',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;
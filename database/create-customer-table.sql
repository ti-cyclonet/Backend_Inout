-- Script para crear la tabla customer en InOut
-- Esta tabla mantiene la relación entre usuarios de Authoriza y tenantId de InOut

CREATE TABLE IF NOT EXISTS customer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL UNIQUE,
    "tenantId" VARCHAR NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_customer_userId ON customer("userId");
CREATE INDEX IF NOT EXISTS idx_customer_tenantId ON customer("tenantId");

-- Comentarios
COMMENT ON TABLE customer IS 'Tabla intermedia que relaciona usuarios de Authoriza con tenantId de InOut';
COMMENT ON COLUMN customer."userId" IS 'ID del usuario en el sistema Authoriza';
COMMENT ON COLUMN customer."tenantId" IS 'ID del tenant en el sistema InOut';

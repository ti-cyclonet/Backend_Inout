-- Crear tabla customers si no existe
CREATE TABLE IF NOT EXISTS customer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    potential_user_id INTEGER,
    tenant_id VARCHAR NOT NULL,
    customer_code VARCHAR(50) UNIQUE,
    business_name VARCHAR(255),
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índice en potential_user_id
CREATE INDEX IF NOT EXISTS IDX_customer_potential_user_id ON customer(potential_user_id);

-- Crear índice en tenant_id
CREATE INDEX IF NOT EXISTS IDX_customer_tenant_id ON customer(tenant_id);
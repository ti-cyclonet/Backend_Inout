-- Agregar columna strInvoiceCode a la tabla sales
ALTER TABLE manufacturing.sales 
ADD COLUMN IF NOT EXISTS "strInvoiceCode" VARCHAR(50) UNIQUE;

-- Generar códigos de factura para ventas existentes
DO $$
DECLARE
    sale_record RECORD;
    counter INTEGER := 1;
BEGIN
    FOR sale_record IN 
        SELECT "strId" 
        FROM manufacturing.sales 
        WHERE "strInvoiceCode" IS NULL 
        ORDER BY "dtmCreationDate" ASC
    LOOP
        UPDATE manufacturing.sales 
        SET "strInvoiceCode" = 'JMY-F-' || LPAD(counter::TEXT, 5, '0')
        WHERE "strId" = sale_record."strId";
        
        counter := counter + 1;
    END LOOP;
END $$;

-- Drop existing unique constraint
ALTER TABLE manufacturing.sales DROP CONSTRAINT IF EXISTS "UQ_42ad3b99a53f11ba6caab70e664";

-- Create new composite unique constraint for strInvoiceCode + strTenantId
ALTER TABLE manufacturing.sales ADD CONSTRAINT "UQ_sales_strInvoiceCode_strTenantId" UNIQUE ("strInvoiceCode", "strTenantId");

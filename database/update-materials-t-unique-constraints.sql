-- Drop existing unique constraints
ALTER TABLE manufacturing."materials-t" DROP CONSTRAINT IF EXISTS "UQ_materials-t_strName";
ALTER TABLE manufacturing."materials-t" DROP CONSTRAINT IF EXISTS "UQ_materials-t_strCode";

-- Create new composite unique constraint for strName + strTenantId
ALTER TABLE manufacturing."materials-t" ADD CONSTRAINT "UQ_materials-t_strName_strTenantId" UNIQUE ("strName", "strTenantId");

-- Create unique constraint for strCode
ALTER TABLE manufacturing."materials-t" ADD CONSTRAINT "UQ_materials-t_strCode" UNIQUE ("strCode");

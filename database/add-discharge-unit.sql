-- Add discharge unit column to materials table
ALTER TABLE manufacturing.materials 
ADD COLUMN IF NOT EXISTS strDischargeUnit VARCHAR(50);

-- Update existing records to have the same discharge unit as measurement unit
UPDATE manufacturing.materials 
SET strDischargeUnit = strUnitMeasure 
WHERE strDischargeUnit IS NULL;

-- Make the column NOT NULL after setting default values
ALTER TABLE manufacturing.materials 
ALTER COLUMN strDischargeUnit SET NOT NULL;

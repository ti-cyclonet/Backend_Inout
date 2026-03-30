-- Update existing materials to set discharge unit same as measurement unit
UPDATE manufacturing.materials 
SET strDischargeUnit = strUnitMeasure 
WHERE strDischargeUnit IS NULL OR strDischargeUnit = '';

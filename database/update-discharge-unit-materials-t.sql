-- Update existing materials-t to set discharge unit same as measurement unit
UPDATE manufacturing."materials-t" 
SET strDischargeUnit = strUnitMeasure 
WHERE strDischargeUnit IS NULL OR strDischargeUnit = '';

export class BulkUploadMaterialDto {
  strName: string;
  strDescription?: string;
  fltPrice: number;
  strUnitMeasure: string;
  strDischargeUnit: string;
  ingMaxStock: number;
  ingMinStock: number;
  strLocation?: string;
  categoryId?: number;
}

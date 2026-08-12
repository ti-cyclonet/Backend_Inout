import { Injectable } from '@nestjs/common';

/**
 * Service for unit of measurement conversions.
 * Supports weight, volume, length, and custom conversions per tenant.
 */
@Injectable()
export class UnitConversionService {

  // Standard conversion factors (base unit → derived unit)
  private conversions: Record<string, Record<string, number>> = {
    // Weight (base: g)
    'mg': { 'g': 0.001, 'kg': 0.000001, 'lb': 0.0000022046, 'oz': 0.000035274 },
    'g': { 'mg': 1000, 'kg': 0.001, 'lb': 0.0022046, 'oz': 0.035274 },
    'kg': { 'mg': 1000000, 'g': 1000, 'lb': 2.2046, 'oz': 35.274 },
    'lb': { 'mg': 453592, 'g': 453.592, 'kg': 0.453592, 'oz': 16 },
    'oz': { 'mg': 28349.5, 'g': 28.3495, 'kg': 0.0283495, 'lb': 0.0625 },

    // Volume (base: ml)
    'ml': { 'l': 0.001, 'gal': 0.000264172 },
    'l': { 'ml': 1000, 'gal': 0.264172 },
    'gal': { 'ml': 3785.41, 'l': 3.78541 },

    // Length (base: cm)
    'cm': { 'm': 0.01, 'in': 0.393701, 'ft': 0.0328084 },
    'm': { 'cm': 100, 'in': 39.3701, 'ft': 3.28084 },
    'in': { 'cm': 2.54, 'm': 0.0254, 'ft': 0.0833333 },
    'ft': { 'cm': 30.48, 'm': 0.3048, 'in': 12 },

    // Quantity (no conversion)
    'und': { 'pza': 1, 'cja': 1, 'pqt': 1 },
    'pza': { 'und': 1 },
    'doc': { 'und': 12, 'pza': 12 },
  };

  /**
   * Convert a quantity from one unit to another.
   * Returns null if conversion is not possible.
   */
  convert(quantity: number, fromUnit: string, toUnit: string): number | null {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();

    if (from === to) return quantity;

    const factor = this.conversions[from]?.[to];
    if (factor !== undefined) {
      return quantity * factor;
    }

    return null; // Cannot convert
  }

  /**
   * Check if two units are convertible.
   */
  canConvert(fromUnit: string, toUnit: string): boolean {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();
    if (from === to) return true;
    return this.conversions[from]?.[to] !== undefined;
  }

  /**
   * Get all units that a given unit can convert to.
   */
  getConvertibleUnits(unit: string): string[] {
    const u = unit.toLowerCase().trim();
    return Object.keys(this.conversions[u] || {});
  }

  /**
   * Get the conversion factor between two units.
   */
  getFactor(fromUnit: string, toUnit: string): number | null {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();
    if (from === to) return 1;
    return this.conversions[from]?.[to] || null;
  }
}

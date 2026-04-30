import { SetMetadata } from '@nestjs/common';

export const LIMIT_VARIABLE_KEY = 'limitVariable';

/**
 * Decorator that marks a controller method as subject to usage limit enforcement.
 * Used in conjunction with LimitEnforcementGuard.
 *
 * @param variableName - The usage limit variable name (e.g. 'nMateriales', 'nProductos')
 */
export const CheckLimit = (variableName: string) =>
  SetMetadata(LIMIT_VARIABLE_KEY, variableName);

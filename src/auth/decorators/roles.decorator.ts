import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access to specific roles.
 * Usage: @Roles('admin', 'operator')
 * 
 * Roles hierarchy:
 * - admin: Full access (CRUD, config, users, reports)
 * - operator: Create/Read/Update (sales, production, entries/exits). No delete, no config.
 * - viewer: Read-only (dashboard, kardex, inventory). No modifications.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

import { SetMetadata } from '@nestjs/common'
import type { SsoRole } from '../../enum/sso-role.enum'
import type { CstarRole } from '../../enum/cstar-role.enum'

export const ROLES_KEY = 'roles'

export type Role = SsoRole | CstarRole

/**
 * Declares the roles a route accepts; having any one of them is enough.
 *
 * This only records metadata. A role-checking guard applied with `@UseGuards()` reads it
 * and enforces it, so `@Roles()` on its own protects nothing. The global
 * ExplicitAuthGuard still rejects a route that has `@Roles()` but no `@UseGuards()`.
 *
 * @example
 * ```ts
 * @UseGuards(ChosenAdminGuard)
 * @Roles(SsoRole.CHOSEN_ADMIN)
 * @Get('tenants')
 * listTenants() {}
 * ```
 */
export const Roles = (...roles: (Role | Role[])[]) => SetMetadata(ROLES_KEY, roles.flat())

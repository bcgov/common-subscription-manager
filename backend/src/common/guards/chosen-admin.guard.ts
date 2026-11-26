import type { ExecutionContext } from '@nestjs/common'
import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import type { KeycloakToken } from '../../auth/keycloak-token'
import { KEYCLOAK_JWT } from '../../auth/keycloak-token'
import { SsoRole } from '../../enum/sso-role.enum'
import { AuthenticatesCaller } from '../decorators/authenticates-caller.decorator'
import { ROLES_KEY } from '../decorators/roles.decorator'

const SSO_ROLES = new Set<string>(Object.values(SsoRole))

/**
 * For CHOSEN-wide operations that aren't tied to a tenant, such as managing tenants.
 *
 * 1. Verifies the Keycloak token (KeycloakJwtStrategy); a missing or invalid token is `401`.
 * 2. Checks the token was issued to the CHOSEN client (`azp`).
 * 3. Requires at least one of the SSO roles named in `@Roles()`, from `client_roles`.
 *
 * A route using this guard without any SSO role in `@Roles()` is refused rather than
 * opened to every signed-in user.
 */
@AuthenticatesCaller()
@Injectable()
export class ChosenAdminGuard extends AuthGuard(KEYCLOAK_JWT) {
  private readonly logger = new Logger(ChosenAdminGuard.name)
  private readonly clientId: string

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    super()
    this.clientId = config.getOrThrow<string>('KEYCLOAK_CLIENT_ID')
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) {
      return false
    }

    const token = context.switchToHttp().getRequest<{ user: KeycloakToken }>().user
    if (token.azp !== this.clientId) {
      this.logger.warn(`Token issued to client ${token.azp}, expected ${this.clientId}`)
      throw new ForbiddenException('Token was not issued to CHOSEN')
    }

    const required = this.requiredSsoRoles(context)
    if (required.length === 0) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} uses ChosenAdminGuard ` +
          'without an SsoRole in @Roles(); refusing every request.',
      )
      throw new ForbiddenException('No role is configured for this route')
    }

    const held = token.client_roles ?? []
    if (!required.some((role) => held.includes(role))) {
      this.logger.warn(`User ${token.sub} lacks any of [${required.join(', ')}]`)
      throw new ForbiddenException('User does not have the required role')
    }

    return true
  }

  private requiredSsoRoles(context: ExecutionContext): string[] {
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    return (roles ?? []).filter((role) => SSO_ROLES.has(role))
  }
}

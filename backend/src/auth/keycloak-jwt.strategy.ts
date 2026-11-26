import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { passportJwtSecret } from 'jwks-rsa'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { KeycloakToken } from './keycloak-token'
import { KEYCLOAK_JWT } from './keycloak-token'

/**
 * Verifies a bearer token from BC Gov SSO: its signature against the realm's published
 * keys, its expiry, its issuer (KEYCLOAK_ISSUER) and its audience (KEYCLOAK_CLIENT_ID).
 *
 * Both settings are required, with no fallback. A default would most likely be the DEV
 * realm, and a PROD pod that silently accepted DEV tokens is worse than one that won't
 * start.
 */
@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, KEYCLOAK_JWT) {
  constructor(config: ConfigService) {
    const issuer = config.getOrThrow<string>('KEYCLOAK_ISSUER')
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer,
      audience: config.getOrThrow<string>('KEYCLOAK_CLIENT_ID'),
      algorithms: ['RS256'],
    })
  }

  validate(payload: KeycloakToken): KeycloakToken {
    return payload
  }
}

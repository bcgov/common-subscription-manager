import { ConfigService } from '@nestjs/config'
import { KeycloakJwtStrategy } from './keycloak-jwt.strategy'

const requestedUris = vi.hoisted(() => [] as string[])
vi.mock('jwks-rsa', () => ({
  passportJwtSecret: (options: { jwksUri: string }) => {
    requestedUris.push(options.jwksUri)
    return () => undefined
  },
}))

const ISSUER = 'http://localhost:8080/realms/standard'

function strategyWith(settings: Record<string, string>) {
  return new KeycloakJwtStrategy(new ConfigService(settings))
}

describe('KeycloakJwtStrategy', () => {
  beforeEach(() => {
    requestedUris.length = 0
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to start without an issuer and client ID', () => {
    // ConfigService falls back to process.env, where vitest.config.mts sets both for the suite.
    vi.stubEnv('KEYCLOAK_ISSUER', undefined)
    vi.stubEnv('KEYCLOAK_CLIENT_ID', undefined)
    expect(() => strategyWith({ KEYCLOAK_CLIENT_ID: 'chosen' })).toThrow(/KEYCLOAK_ISSUER/)
    expect(() => strategyWith({ KEYCLOAK_ISSUER: ISSUER })).toThrow(/KEYCLOAK_CLIENT_ID/)
  })

  it("uses KEYCLOAK_JWKS_URI for the realm's keys when it's set", () => {
    strategyWith({
      KEYCLOAK_ISSUER: ISSUER,
      KEYCLOAK_CLIENT_ID: 'chosen-local',
      KEYCLOAK_JWKS_URI: 'http://keycloak:8080/realms/standard/protocol/openid-connect/certs',
    })
    expect(requestedUris).toEqual([
      'http://keycloak:8080/realms/standard/protocol/openid-connect/certs',
    ])
  })
})

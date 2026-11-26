import { generateKeyPairSync, sign } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Controller, Get, UseGuards } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AuthModule } from '../../auth/auth.module'
import { CstarRole } from '../../enum/cstar-role.enum'
import { SsoRole } from '../../enum/sso-role.enum'
import { Roles } from '../decorators/roles.decorator'
import { ChosenAdminGuard } from './chosen-admin.guard'
import { ExplicitAuthGuard } from './explicit-auth.guard'

const ISSUER = 'https://sso.example.test/auth/realms/standard'
const CLIENT_ID = 'chosen-test'

// Stands in for Keycloak's published keys. Everything else (Passport, signature, expiry,
// issuer and audience checks) is the real code path.
const jwks = vi.hoisted(() => ({ publicKey: '', requestedUris: [] as string[] }))
vi.mock('jwks-rsa', () => ({
  passportJwtSecret: (options: { jwksUri: string }) => {
    jwks.requestedUris.push(options.jwksUri)
    return (_req: unknown, _rawJwt: unknown, done: (err: unknown, key?: string) => void) =>
      done(null, jwks.publicKey)
  },
}))

const realmKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
jwks.publicKey = realmKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()

function signToken(overrides: Record<string, unknown> = {}, key = realmKeys.privateKey): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url')
  const payload = {
    iss: ISSUER,
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    sub: 'user-1',
    client_roles: [SsoRole.CHOSEN_ADMIN],
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  }
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}`
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), key).toString('base64url')}`
}

@Controller('admin')
@UseGuards(ChosenAdminGuard)
class AdminController {
  @Roles(SsoRole.CHOSEN_ADMIN)
  @Get()
  get() {
    return 'ok'
  }

  @Get('no-roles')
  noRoles() {
    return 'should not be reached'
  }

  @Roles(CstarRole.CHOSEN_VIEWER)
  @Get('cstar-only')
  cstarOnly() {
    return 'should not be reached'
  }
}

describe('ChosenAdminGuard', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ KEYCLOAK_ISSUER: ISSUER, KEYCLOAK_CLIENT_ID: CLIENT_ID })],
        }),
        AuthModule,
      ],
      controllers: [AdminController],
      providers: [{ provide: APP_GUARD, useClass: ExplicitAuthGuard }],
    }).compile()
    app = moduleRef.createNestApplication({ logger: false })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path)
    return token ? req.set('Authorization', `Bearer ${token}`) : req
  }

  it("fetches the realm's keys from the issuer's certs URL", () => {
    expect(jwks.requestedUris).toEqual([`${ISSUER}/protocol/openid-connect/certs`])
  })

  it('lets through a valid token with the required role', async () => {
    await get('/admin', signToken()).expect(200).expect('ok')
  })

  it.each([
    ['no token', undefined],
    ['a token signed with another key', signToken({}, otherKeys.privateKey)],
    ['a token from another issuer', signToken({ iss: 'https://evil.example.test/realms/x' })],
    ['a token for another audience', signToken({ aud: 'some-other-client' })],
    ['an expired token', signToken({ exp: Math.floor(Date.now() / 1000) - 60 })],
  ])('rejects %s with 401', async (_case, token) => {
    await get('/admin', token).expect(401)
  })

  it.each([
    ['a token issued to another client (azp)', '/admin', signToken({ azp: 'some-other-client' })],
    ['a token without the required role', '/admin', signToken({ client_roles: [] })],
    ['a route that declares no roles', '/admin/no-roles', signToken()],
    ['a route that declares only CSTAR roles', '/admin/cstar-only', signToken()],
  ])('rejects %s with 403', async (_case, path, token) => {
    await get(path, token).expect(403)
  })
})

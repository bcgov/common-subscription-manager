const kc = vi.hoisted(() => ({
  settings: undefined as unknown,
  authenticated: false,
  token: undefined as string | undefined,
  tokenParsed: undefined as Record<string, unknown> | undefined,
  init: vi.fn(),
  updateToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('keycloak-js', () => ({
  default: class {
    constructor(settings: unknown) {
      kc.settings = settings
    }
    get authenticated() {
      return kc.authenticated
    }
    get token() {
      return kc.token
    }
    get tokenParsed() {
      return kc.tokenParsed
    }
    init = kc.init
    updateToken = kc.updateToken
    login = kc.login
    logout = kc.logout
  },
}))

const claims = {
  sub: 'subject-1',
  idir_user_guid: 'A11CE0000000000000000000000000AD',
  idir_username: 'admin',
  display_name: 'Local Operator',
  client_roles: ['CHOSEN_ADMIN'],
}

async function freshModule() {
  vi.resetModules()
  return import('@/auth/keycloak')
}

describe('keycloak', () => {
  beforeEach(() => {
    window.VITE_KEYCLOAK_ISSUER = 'http://localhost:4880/realms/standard'
    window.VITE_KEYCLOAK_CLIENT_ID = 'chosen-local'
    kc.authenticated = false
    kc.token = undefined
    kc.tokenParsed = undefined
    vi.clearAllMocks()
    kc.init.mockImplementation(async () => {
      kc.authenticated = true
      kc.token = 'access-token'
      kc.tokenParsed = claims
      return true
    })
  })

  test('gives no token, and loads nothing, before anyone signs in', async () => {
    const { getAccessToken } = await freshModule()
    await expect(getAccessToken()).resolves.toBeUndefined()
    expect(kc.settings).toBeUndefined()
  })

  test('signs in once with PKCE, however often a staff page asks', async () => {
    const { signIn } = await freshModule()
    const [first, second] = await Promise.all([signIn(), signIn()])

    expect(kc.init).toHaveBeenCalledTimes(1)
    expect(kc.init).toHaveBeenCalledWith(
      expect.objectContaining({ onLoad: 'login-required', pkceMethod: 'S256' }),
    )
    expect(kc.settings).toEqual({
      url: 'http://localhost:4880',
      realm: 'standard',
      clientId: 'chosen-local',
    })
    expect(first).toBe(second)
    expect(first).toEqual({
      id: 'A11CE0000000000000000000000000AD',
      username: 'admin',
      name: 'Local Operator',
      roles: ['CHOSEN_ADMIN'],
    })
  })

  test('tries again on the next call if signing in failed', async () => {
    const { signIn } = await freshModule()
    kc.init.mockRejectedValueOnce(new Error('Keycloak unreachable'))
    await expect(signIn()).rejects.toThrow('Keycloak unreachable')
    await expect(signIn()).resolves.toMatchObject({ username: 'admin' })
    expect(kc.init).toHaveBeenCalledTimes(2)
  })

  test('refreshes the token before handing it out', async () => {
    const { getAccessToken, signIn } = await freshModule()
    await signIn()
    kc.updateToken.mockResolvedValueOnce(true)

    await expect(getAccessToken()).resolves.toBe('access-token')
    expect(kc.updateToken).toHaveBeenCalledWith(30)
  })

  test('sends the person to sign in again when the session has ended', async () => {
    const { getAccessToken, signIn } = await freshModule()
    await signIn()
    kc.updateToken.mockRejectedValueOnce(new Error('session expired'))

    await expect(getAccessToken()).resolves.toBeUndefined()
    expect(kc.login).toHaveBeenCalledTimes(1)
  })

  test('never keeps the token in localStorage', async () => {
    const { signIn } = await freshModule()
    await signIn()
    expect(JSON.stringify({ ...localStorage })).not.toContain('access-token')
  })
})

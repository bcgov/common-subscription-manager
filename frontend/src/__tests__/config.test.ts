import { apiBaseUrl, keycloakSettings } from '@/config'

describe('keycloakSettings', () => {
  afterEach(() => {
    delete window.VITE_KEYCLOAK_ISSUER
    delete window.VITE_KEYCLOAK_CLIENT_ID
    vi.unstubAllEnvs()
  })

  test('splits the issuer into the Keycloak URL and realm', () => {
    window.VITE_KEYCLOAK_ISSUER = 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard'
    window.VITE_KEYCLOAK_CLIENT_ID = 'chosen-6820'
    expect(keycloakSettings()).toEqual({
      url: 'https://dev.loginproxy.gov.bc.ca/auth',
      realm: 'standard',
      clientId: 'chosen-6820',
    })
  })

  test('uses the runtime settings over the build-time ones', () => {
    vi.stubEnv('VITE_KEYCLOAK_ISSUER', 'http://localhost:4880/realms/standard')
    vi.stubEnv('VITE_KEYCLOAK_CLIENT_ID', 'chosen-local')
    expect(keycloakSettings().url).toBe('http://localhost:4880')

    window.VITE_KEYCLOAK_ISSUER = 'https://test.loginproxy.gov.bc.ca/auth/realms/standard'
    expect(keycloakSettings().url).toBe('https://test.loginproxy.gov.bc.ca/auth')
  })

  test('refuses to guess when sign-in is not configured', () => {
    vi.stubEnv('VITE_KEYCLOAK_ISSUER', '')
    vi.stubEnv('VITE_KEYCLOAK_CLIENT_ID', '')
    expect(() => keycloakSettings()).toThrow(/not configured/)
  })

  test('rejects an issuer that is not a realm URL', () => {
    window.VITE_KEYCLOAK_ISSUER = 'https://dev.loginproxy.gov.bc.ca/auth'
    window.VITE_KEYCLOAK_CLIENT_ID = 'chosen-6820'
    expect(() => keycloakSettings()).toThrow(/not a Keycloak realm URL/)
  })
})

describe('apiBaseUrl', () => {
  afterEach(() => {
    delete window.VITE_API_URL
    vi.unstubAllEnvs()
  })

  test('is the gateway URL from the runtime settings, without a trailing slash', () => {
    window.VITE_API_URL = 'https://chosen.dev.api.gov.bc.ca/pr-12/api/'
    expect(apiBaseUrl()).toBe('https://chosen.dev.api.gov.bc.ca/pr-12/api')
  })

  test('refuses to guess when the API is not configured', () => {
    vi.stubEnv('VITE_API_URL', '')
    expect(() => apiBaseUrl()).toThrow(/not configured/)
  })
})

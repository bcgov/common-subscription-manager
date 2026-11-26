import type Keycloak from 'keycloak-js'
import type { KeycloakTokenParsed } from 'keycloak-js'
import { keycloakSettings } from '@/config'

export interface SignedInUser {
  /** IDIR user GUID, which CSTAR and the backend identify the person by. */
  id: string
  username: string
  name: string
  /** CHOSEN-wide SSO roles, such as CHOSEN_ADMIN. Tenant roles come from CSTAR. */
  roles: string[]
}

interface ChosenTokenClaims extends KeycloakTokenParsed {
  idir_user_guid?: string
  idir_username?: string
  display_name?: string
  name?: string
  preferred_username?: string
  client_roles?: string[]
}

// Keycloak is loaded and created only when a staff page needs it, so public pages (confirm,
// unsubscribe, manage) never download it or send anyone to an IDIR sign-in. The token stays in memory, inside
// keycloak-js; it's never written to localStorage, where any injected script could read it.
let keycloak: Keycloak | undefined
let signingIn: Promise<SignedInUser> | undefined

async function client(): Promise<Keycloak> {
  if (!keycloak) {
    const { default: KeycloakClient } = await import('keycloak-js')
    keycloak ??= new KeycloakClient(keycloakSettings())
  }
  return keycloak
}

async function startSignIn(): Promise<SignedInUser> {
  const kc = await client()
  await kc.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  return userFrom(kc.tokenParsed as ChosenTokenClaims)
}

function userFrom(claims: ChosenTokenClaims | undefined): SignedInUser {
  if (!claims?.sub) throw new Error('Signed in, but the token has no subject.')
  const username = claims.idir_username ?? claims.preferred_username ?? claims.sub
  return {
    id: claims.idir_user_guid ?? claims.sub,
    username,
    name: claims.display_name ?? claims.name ?? username,
    roles: claims.client_roles ?? [],
  }
}

/**
 * Signs the person in, sending them to Keycloak if they aren't already. Safe to call on every
 * staff page: Keycloak is set up once and the result reused.
 */
export function signIn(): Promise<SignedInUser> {
  signingIn ??= startSignIn().catch((error: unknown) => {
    signingIn = undefined
    throw error
  })
  return signingIn
}

/**
 * A current access token for calling the API, refreshed if it expires within 30 seconds, or
 * undefined if nobody is signed in. If the session can't be refreshed, sends the person to sign
 * in again.
 */
export async function getAccessToken(): Promise<string | undefined> {
  if (!keycloak?.authenticated) return undefined
  try {
    await keycloak.updateToken(30)
    return keycloak.token
  } catch {
    await keycloak.login()
    return undefined
  }
}

export function signOut(): Promise<void> {
  if (!keycloak) return Promise.resolve()
  return keycloak.logout({ redirectUri: window.location.origin })
}

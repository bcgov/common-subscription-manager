/** The claims CHOSEN reads from a BC Gov SSO (Keycloak) access token. */
export interface KeycloakToken {
  iss: string
  sub: string
  azp?: string
  aud?: string | string[]
  exp?: number
  client_roles?: string[]
  idir_user_guid?: string
  idir_username?: string
  email?: string
  display_name?: string
}

/** Name the Keycloak JWT strategy is registered under with Passport. */
export const KEYCLOAK_JWT = 'keycloak-jwt'

// Settings that differ per environment. A deployed image gets them at runtime from
// /static/config.js, which Caddy writes from the container's environment, so one image serves
// every environment. The Vite dev server has no Caddy, so there they come from VITE_* variables.

/**
 * The CHOSEN API, through the API gateway: e.g. https://chosen.dev.api.gov.bc.ca/api, or
 * http://localhost:4800/api locally. Kong is the only way to the backend, for this UI too.
 */
export function apiBaseUrl(): string {
  const url = window.VITE_API_URL || import.meta.env.VITE_API_URL
  if (!url) {
    throw new Error('The API is not configured: VITE_API_URL is required.')
  }
  return url.replace(/\/+$/, '')
}

export interface KeycloakSettings {
  url: string
  realm: string
  clientId: string
}

/**
 * Where people sign in. Configured as the realm's issuer URL, the same value the backend checks
 * tokens against, so the two can't disagree; the Keycloak URL and realm are taken from it.
 */
export function keycloakSettings(): KeycloakSettings {
  const issuer = window.VITE_KEYCLOAK_ISSUER || import.meta.env.VITE_KEYCLOAK_ISSUER
  const clientId = window.VITE_KEYCLOAK_CLIENT_ID || import.meta.env.VITE_KEYCLOAK_CLIENT_ID
  if (!issuer || !clientId) {
    throw new Error(
      'Sign-in is not configured: VITE_KEYCLOAK_ISSUER and VITE_KEYCLOAK_CLIENT_ID are required.',
    )
  }
  const match = /^(.+)\/realms\/([^/]+)\/?$/.exec(issuer)
  if (!match) {
    throw new Error(`VITE_KEYCLOAK_ISSUER is not a Keycloak realm URL: ${issuer}`)
  }
  return { url: match[1], realm: match[2], clientId }
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_KEYCLOAK_ISSUER?: string
  readonly VITE_KEYCLOAK_CLIENT_ID?: string
}

// Set at runtime by /static/config.js, which Caddy writes from the container's environment.
interface Window {
  VITE_API_URL?: string
  VITE_KEYCLOAK_ISSUER?: string
  VITE_KEYCLOAK_CLIENT_ID?: string
}

/**
 * Client roles assigned in the CHOSEN Keycloak client (SSO dashboard). They arrive in the
 * token's `client_roles` claim and aren't tied to a tenant.
 */
export enum SsoRole {
  CHOSEN_ADMIN = 'CHOSEN_ADMIN',
}

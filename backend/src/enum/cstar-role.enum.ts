/**
 * Roles a user holds for one tenant, defined in CSTAR and returned by its
 * shared-service-roles endpoint.
 */
export enum CstarRole {
  CHOSEN_VIEWER = 'CHOSEN_VIEWER',
  CHOSEN_TOPIC_EDITOR = 'CHOSEN_TOPIC_EDITOR',
  CHOSEN_OPERATIONS_ADMIN = 'CHOSEN_OPERATIONS_ADMIN',
}

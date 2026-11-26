export const AUTHENTICATES_CALLER_KEY = 'authenticatesCaller'

/**
 * Marks a guard class as one that establishes who the caller is: it verifies a token, an
 * API key or a signature, and rejects the request if it can't.
 *
 * ExplicitAuthGuard only accepts a route whose `@UseGuards()` includes at least one guard
 * marked like this. A guard that checks something else, such as a feature flag, doesn't
 * protect a route on its own and must not carry this marker.
 */
export const AuthenticatesCaller = (): ClassDecorator => (target) => {
  Reflect.defineMetadata(AUTHENTICATES_CALLER_KEY, true, target)
}

/** Whether a guard from `@UseGuards()`, given as a class or an instance, is marked. */
export function authenticatesCaller(guard: unknown): boolean {
  const target = typeof guard === 'function' ? guard : (guard as object | null)?.constructor
  return target !== undefined && Reflect.getMetadata(AUTHENTICATES_CALLER_KEY, target) === true
}

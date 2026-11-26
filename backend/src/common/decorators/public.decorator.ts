import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/**
 * Marks a route, or every route on a controller, as needing no authentication.
 * Without this or a `@UseGuards()`, the global ExplicitAuthGuard rejects the route.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { authenticatesCaller } from '../decorators/authenticates-caller.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * Global guard that makes every route fail closed.
 *
 * A route is let through only if it is marked `@Public()`, or if its `@UseGuards()`, on
 * the handler or the controller, includes a guard marked `@AuthenticatesCaller()`. Those
 * guards do the real authentication and authorisation; this one checks nothing about the
 * caller. It exists so that a route nobody protected, or one protected only by a guard
 * that doesn't identify the caller (a feature flag, say), is rejected instead of open.
 */
@Injectable()
export class ExplicitAuthGuard implements CanActivate {
  private readonly logger = new Logger(ExplicitAuthGuard.name)

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()]

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true
    }

    const guards = this.reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, targets)
    if (guards.some(authenticatesCaller)) {
      return true
    }

    this.logger.warn(
      `Unprotected route rejected: ${context.getClass().name}.${context.getHandler().name}. ` +
        'Add @Public(), or @UseGuards() with a guard marked @AuthenticatesCaller().',
    )
    throw new UnauthorizedException(
      'Route must be marked @Public() or guarded by a guard that authenticates the caller',
    )
  }
}

import type { CanActivate, INestApplication } from '@nestjs/common'
import { Controller, Get, Injectable, UseGuards } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AuthenticatesCaller } from '../decorators/authenticates-caller.decorator'
import { Public } from '../decorators/public.decorator'
import { Roles } from '../decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { ExplicitAuthGuard } from './explicit-auth.guard'

@AuthenticatesCaller()
@Injectable()
class AllowGuard implements CanActivate {
  canActivate() {
    return true
  }
}

// Passes every request but doesn't identify the caller, like a feature-flag guard.
@Injectable()
class NonAuthGuard implements CanActivate {
  canActivate() {
    return true
  }
}

// Inherits the marker from AllowGuard.
@Injectable()
class SubclassedAllowGuard extends AllowGuard {}

@Controller('open-route')
class PublicRouteController {
  @Public()
  @Get()
  get() {
    return 'ok'
  }

  @Get('unmarked')
  unmarked() {
    return 'should not be reached'
  }
}

@Public()
@Controller('open-controller')
class PublicControllerController {
  @Get()
  get() {
    return 'ok'
  }
}

@Controller('guarded-route')
class GuardedRouteController {
  @UseGuards(AllowGuard)
  @Get()
  get() {
    return 'ok'
  }

  @UseGuards(new AllowGuard())
  @Get('instance')
  instance() {
    return 'ok'
  }

  @UseGuards(NonAuthGuard, AllowGuard)
  @Get('mixed')
  mixed() {
    return 'ok'
  }

  @UseGuards(SubclassedAllowGuard)
  @Get('subclassed')
  subclassed() {
    return 'ok'
  }

  @UseGuards(NonAuthGuard)
  @Get('non-auth-only')
  nonAuthOnly() {
    return 'should not be reached'
  }

  @UseGuards(new NonAuthGuard())
  @Get('non-auth-instance')
  nonAuthInstance() {
    return 'should not be reached'
  }
}

@UseGuards(NonAuthGuard)
@Controller('non-auth-controller')
class NonAuthControllerController {
  @Get()
  get() {
    return 'should not be reached'
  }

  @UseGuards(AllowGuard)
  @Get('with-auth')
  withAuth() {
    return 'ok'
  }
}

@UseGuards(AllowGuard)
class GuardedBaseController {}

@Controller('guarded-inherited')
class GuardedInheritedController extends GuardedBaseController {
  @Get()
  get() {
    return 'ok'
  }
}

@Controller('unprotected')
class UnprotectedController {
  @Get()
  get() {
    return 'should not be reached'
  }

  @Roles(SsoRole.CHOSEN_ADMIN)
  @Get('roles-only')
  rolesOnly() {
    return 'should not be reached'
  }
}

describe('ExplicitAuthGuard', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PublicRouteController,
        PublicControllerController,
        GuardedRouteController,
        GuardedInheritedController,
        NonAuthControllerController,
        UnprotectedController,
      ],
      providers: [
        AllowGuard,
        NonAuthGuard,
        SubclassedAllowGuard,
        { provide: APP_GUARD, useClass: ExplicitAuthGuard },
      ],
    }).compile()
    app = moduleRef.createNestApplication({ logger: false })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it.each([
    ['a route marked @Public()', '/open-route'],
    ['a route on a controller marked @Public()', '/open-controller'],
    ['a route with an authenticating guard', '/guarded-route'],
    ['a route with an authenticating guard instance', '/guarded-route/instance'],
    ['a route with an authenticating guard beside another guard', '/guarded-route/mixed'],
    ['a route with a subclass of an authenticating guard', '/guarded-route/subclassed'],
    ['a route whose controller inherits an authenticating guard', '/guarded-inherited'],
    [
      'an authenticating route guard on a controller with a non-authenticating guard',
      '/non-auth-controller/with-auth',
    ],
  ])('lets through %s', async (_case, path) => {
    await request(app.getHttpServer()).get(path).expect(200).expect('ok')
  })

  it.each([
    ['a route with neither @Public() nor @UseGuards()', '/unprotected'],
    ['an unmarked route beside a @Public() one', '/open-route/unmarked'],
    ['a route with @Roles() but no guard to enforce it', '/unprotected/roles-only'],
    ['a route guarded only by a non-authenticating guard', '/guarded-route/non-auth-only'],
    ['a route guarded only by a non-authenticating instance', '/guarded-route/non-auth-instance'],
    ['a controller guarded only by a non-authenticating guard', '/non-auth-controller'],
  ])('rejects %s with 401', async (_case, path) => {
    await request(app.getHttpServer()).get(path).expect(401)
  })
})

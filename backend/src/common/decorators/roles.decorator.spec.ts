import { Reflector } from '@nestjs/core'
import { CstarRole } from '../../enum/cstar-role.enum'
import { SsoRole } from '../../enum/sso-role.enum'
import { ROLES_KEY, Roles } from './roles.decorator'

describe('Roles', () => {
  it('records the roles as one flat list, whether given singly or as arrays', () => {
    class Target {
      @Roles(SsoRole.CHOSEN_ADMIN, [CstarRole.CHOSEN_VIEWER, CstarRole.CHOSEN_TOPIC_EDITOR])
      handler() {}
    }

    expect(new Reflector().get(ROLES_KEY, Target.prototype.handler)).toEqual([
      SsoRole.CHOSEN_ADMIN,
      CstarRole.CHOSEN_VIEWER,
      CstarRole.CHOSEN_TOPIC_EDITOR,
    ])
  })
})

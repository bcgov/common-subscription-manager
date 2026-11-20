import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  Equal,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Not,
} from 'typeorm'
import { UsersService } from './users.service'
import { User } from './entities/user.entity'

describe('UserService', () => {
  let service: UsersService
  let repository: Repository<User>

  const savedUser1: User = { id: '1', name: 'Test Numone', email: 'numone@test.com' }
  const savedUser2: User = { id: '2', name: 'Test Numtwo', email: 'numtwo@test.com' }
  const oneUser = { id: 1, name: 'Test Numone', email: 'numone@test.com' }
  const updateUser = { id: 1, name: 'Test Numone update', email: 'numoneupdate@test.com' }
  const updatedUser: User = { id: '1', name: 'Test Numone update', email: 'numoneupdate@test.com' }
  const twoUser = { id: 2, name: 'Test Numtwo', email: 'numtwo@test.com' }

  const userArray = [oneUser, twoUser]
  const savedUserArray = [savedUser1, savedUser2]

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: vi.fn().mockResolvedValue(savedUserArray),
            findOneBy: vi.fn().mockResolvedValue(savedUser1),
            findAndCount: vi.fn().mockResolvedValue([[], 0]),
            create: vi.fn((u) => u),
            save: vi.fn().mockResolvedValue(savedUser1),
            delete: vi.fn().mockResolvedValue({ affected: 1 }),
          },
        },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
    repository = module.get<Repository<User>>(getRepositoryToken(User))
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('createOne', () => {
    it('should successfully add a user', async () => {
      await expect(service.create(oneUser)).resolves.toEqual(oneUser)
      expect(repository.save).toBeCalledTimes(1)
    })
  })

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const users = await service.findAll()
      expect(users).toEqual(userArray)
    })
  })

  describe('findOne', () => {
    it('should get a single user', async () => {
      await expect(service.findOne(1)).resolves.toEqual(oneUser)
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: '1' })
    })
    it('should return null when the user does not exist', async () => {
      vi.spyOn(repository, 'findOneBy').mockResolvedValueOnce(null)
      await expect(service.findOne(99)).resolves.toBeNull()
    })
  })

  describe('update', () => {
    it('should call the save method', async () => {
      vi.spyOn(repository, 'save').mockResolvedValueOnce(updatedUser)
      const user = await service.update(1, updateUser)
      expect(user).toEqual(updateUser)
      expect(repository.save).toBeCalledTimes(1)
    })
  })

  describe('remove', () => {
    it('should return {deleted: true}', async () => {
      await expect(service.remove(2)).resolves.toEqual({ deleted: true })
    })
    it('should return {deleted: false, message: err.message}', async () => {
      const repoSpy = vi
        .spyOn(repository, 'delete')
        .mockRejectedValueOnce(new Error('Bad Delete Method.'))
      await expect(service.remove(-1)).resolves.toEqual({
        deleted: false,
        message: 'Bad Delete Method.',
      })
      expect(repoSpy).toBeCalledTimes(1)
    })
  })

  describe('searchUsers', () => {
    const sort = '[{ "name": "asc" }]'
    const filter = '[{ "key": "name", "operation": "eq", "value": "Peter" }]'

    it('should return a list of users with pagination and filtering', async () => {
      vi.spyOn(repository, 'findAndCount').mockResolvedValueOnce([[savedUser1], 1])
      const result = await service.searchUsers(2, 5, sort, filter)

      expect(repository.findAndCount).toHaveBeenCalledWith({
        skip: 5,
        take: 5,
        order: { name: 'ASC' },
        where: { name: Equal('Peter') },
      })
      expect(result).toEqual({ users: [oneUser], page: 2, limit: 5, total: 1, totalPages: 1 })
    })

    it('given no page should default to page 1', async () => {
      const result = await service.searchUsers(null as unknown as number, 10, sort, filter)
      expect(result).toEqual({ users: [], page: 1, limit: 10, total: 0, totalPages: 0 })
    })

    it('given no limit should default to limit 10', async () => {
      const result = await service.searchUsers(1, null as unknown as number, sort, filter)
      expect(result).toEqual({ users: [], page: 1, limit: 10, total: 0, totalPages: 0 })
    })

    it('given limit greater than 200 should default to limit 10', async () => {
      const result = await service.searchUsers(1, 201, sort, filter)
      expect(result).toEqual({ users: [], page: 1, limit: 10, total: 0, totalPages: 0 })
    })

    it('given invalid JSON should throw error', async () => {
      await expect(service.searchUsers(1, 10, '[{ "name" "asc" }]', filter)).rejects.toEqual(
        new Error('Invalid query parameters'),
      )
    })
  })

  describe('convertSortToTypeOrmFormat', () => {
    it('should accept an object or an array, normalise direction and drop unknown fields', () => {
      expect(service.convertSortToTypeOrmFormat({ name: 'ASC' })).toEqual({ name: 'ASC' })
      expect(
        service.convertSortToTypeOrmFormat([{ name: 'desc' }, { email: 'asc' }, { bogus: 'asc' }]),
      ).toEqual({ name: 'DESC', email: 'ASC' })
    })
  })

  describe('convertFiltersToTypeOrmFormat', () => {
    it('should convert each operation to the matching TypeORM operator', () => {
      const ops = (key: 'id' | 'name' | 'email', operation: string, value: unknown) =>
        service.convertFiltersToTypeOrmFormat([{ key, operation, value }])[key]

      expect(ops('name', 'like', '1')).toEqual(Like('%1%'))
      expect(ops('name', 'eq', '2')).toEqual(Equal('2'))
      expect(ops('name', 'neq', '3')).toEqual(Not(Equal('3')))
      expect(ops('id', 'gt', '4')).toEqual(MoreThan('4'))
      expect(ops('id', 'gte', '5')).toEqual(MoreThanOrEqual('5'))
      expect(ops('id', 'lt', '6')).toEqual(LessThan('6'))
      expect(ops('id', 'lte', '7')).toEqual(LessThanOrEqual('7'))
      expect(ops('email', 'in', ['8'])).toEqual(In(['8']))
      expect(ops('email', 'notin', ['9'])).toEqual(Not(In(['9'])))
      expect(ops('email', 'isnull', '10')).toEqual(IsNull())
    })

    it('should ignore fields that are not on the entity', () => {
      expect(
        service.convertFiltersToTypeOrmFormat([{ key: 'password', operation: 'eq', value: 'x' }]),
      ).toEqual({})
    })
  })
})

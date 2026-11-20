import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { FindOptionsOrder, FindOptionsWhere } from 'typeorm'
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
  Repository,
} from 'typeorm'

import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserDto } from './dto/user.dto'
import { User } from './entities/user.entity'

type FilterItem = { key: string; operation: string; value: unknown }

const SEARCHABLE_FIELDS = new Set<keyof User>(['id', 'name', 'email'])

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private toDto(user: User): UserDto {
    return { id: Number(user.id), name: user.name, email: user.email }
  }

  async create(user: CreateUserDto): Promise<UserDto> {
    const savedUser = await this.usersRepository.save(
      this.usersRepository.create({ name: user.name, email: user.email }),
    )
    return this.toDto(savedUser)
  }

  async findAll(): Promise<UserDto[]> {
    const users = await this.usersRepository.find()
    return users.map((user) => this.toDto(user))
  }

  async findOne(id: number): Promise<UserDto | null> {
    const user = await this.usersRepository.findOneBy({ id: String(id) })
    return user ? this.toDto(user) : null
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<UserDto> {
    const user = await this.usersRepository.save({
      id: String(id),
      name: updateUserDto.name,
      email: updateUserDto.email,
    })
    return this.toDto(user)
  }

  async remove(id: number): Promise<{ deleted: boolean; message?: string }> {
    try {
      await this.usersRepository.delete({ id: String(id) })
      return { deleted: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { deleted: false, message }
    }
  }

  async searchUsers(
    page: number,
    limit: number,
    sort: string, // JSON sort, ex: [{"name":"desc"},{"email":"asc"}] or {"name":"ASC"}
    filter: string, // JSON array for key, operation and value, ex: [{"key": "name", "operation": "like", "value": "Jo"}]
  ): Promise<any> {
    page = page || 1
    if (!limit || limit > 200) {
      limit = 10
    }

    let order: FindOptionsOrder<User>
    let filterObj: FilterItem[]
    try {
      order = this.convertSortToTypeOrmFormat(JSON.parse(sort))
      const parsedFilter = JSON.parse(filter)
      filterObj = Array.isArray(parsedFilter) ? parsedFilter : []
    } catch {
      throw new Error('Invalid query parameters')
    }
    const where = this.convertFiltersToTypeOrmFormat(filterObj)

    const [users, count] = await this.usersRepository.findAndCount({
      skip: (page - 1) * limit,
      take: parseInt(String(limit)),
      order,
      where,
    })

    return {
      users: users.map((user) => this.toDto(user)),
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    }
  }

  /** Accepts `{name: 'asc'}` or `[{name: 'asc'}, {email: 'desc'}]`; ignores unknown fields. */
  public convertSortToTypeOrmFormat(sortObj: unknown): FindOptionsOrder<User> {
    const entries = (Array.isArray(sortObj) ? sortObj : [sortObj]).flatMap((s) =>
      s && typeof s === 'object' ? Object.entries(s as Record<string, unknown>) : [],
    )
    const order: Record<string, 'ASC' | 'DESC'> = {}
    for (const [key, dir] of entries) {
      if (SEARCHABLE_FIELDS.has(key as keyof User)) {
        order[key] = String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
      }
    }
    return order as FindOptionsOrder<User>
  }

  /** Converts the API filter format into TypeORM find operators; ignores unknown fields. */
  public convertFiltersToTypeOrmFormat(filterObj: FilterItem[]): FindOptionsWhere<User> {
    const where: Record<string, unknown> = {}

    for (const item of filterObj) {
      if (!SEARCHABLE_FIELDS.has(item.key as keyof User)) {
        continue
      }
      const value = item.value
      switch (item.operation) {
        case 'like':
          where[item.key] = Like(`%${String(value)}%`)
          break
        case 'eq':
          where[item.key] = Equal(value)
          break
        case 'neq':
          where[item.key] = Not(Equal(value))
          break
        case 'gt':
          where[item.key] = MoreThan(value)
          break
        case 'gte':
          where[item.key] = MoreThanOrEqual(value)
          break
        case 'lt':
          where[item.key] = LessThan(value)
          break
        case 'lte':
          where[item.key] = LessThanOrEqual(value)
          break
        case 'in':
          where[item.key] = In(value as unknown[])
          break
        case 'notin':
          where[item.key] = Not(In(value as unknown[]))
          break
        case 'isnull':
          where[item.key] = IsNull()
          break
      }
    }
    return where as FindOptionsWhere<User>
  }
}

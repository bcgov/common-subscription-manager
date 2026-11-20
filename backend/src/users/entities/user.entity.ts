import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Sample entity from the quickstart template; maps to users.users (see migrations/sql).
 * The id is a sequence-backed numeric column, read back as a string by the pg driver.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'numeric', primaryKeyConstraintName: 'USER_PK' })
  id!: string

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ type: 'varchar', length: 200 })
  email!: string
}

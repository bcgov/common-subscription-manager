import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

const dbHost = process.env.POSTGRES_HOST || 'localhost'
const dbUser = process.env.POSTGRES_USER || 'postgres'
const dbPassword = process.env.POSTGRES_PASSWORD || 'default'
const dbPort = Number.parseInt(process.env.POSTGRES_PORT || '5432', 10)
const dbName = process.env.POSTGRES_DATABASE || 'postgres'
const dbSchema = process.env.POSTGRES_SCHEMA || 'chosen'

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      database: dbName,
      schema: dbSchema,
      // Add each entity as it's written.
      entities: [],
      synchronize: false, // Flyway owns the schema (migrations/sql)
      logging: process.env.NODE_ENV !== 'production' ? ['query', 'error'] : ['error'],
      maxQueryExecutionTime: 1000,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { HTTPLoggerMiddleware } from './middleware/req.res.logger'
import { DatabaseModule } from './database.module'
import { ConfigModule } from '@nestjs/config'
import { UsersModule } from './users/users.module'
import { AppService } from './app.service'
import { AppController } from './app.controller'
import { MetricsController } from './metrics.controller'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'
import { APP_GUARD } from '@nestjs/core'
import { ExplicitAuthGuard } from './common/guards/explicit-auth.guard'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
    TerminusModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController, MetricsController, HealthController],
  // Registered here rather than in bootstrap() so every app built from AppModule, tests
  // included, fails closed the same way.
  providers: [AppService, { provide: APP_GUARD, useClass: ExplicitAuthGuard }],
})
export class AppModule {
  // let's add a middleware on all routes
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HTTPLoggerMiddleware)
      .exclude(
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*')
  }
}

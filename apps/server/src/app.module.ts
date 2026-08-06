import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessRestModule } from 'access';
import { AuthModule } from 'auth/auth.module';
import { createTypeOrmOptions } from 'shared/database/typeorm.options';
import { DomainModule } from 'shared/domain/domain.module';
import { AppLoggerModule } from 'shared/logger/app-logger.module';
import { createBullMqOptions } from 'shared/queue/bullmq.options';
import { UsersModule } from 'users/users.module';

@Module({
  imports: [
    UsersModule,
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggerModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createTypeOrmOptions(config),
    }),
    DomainModule,
    AuthModule,
    AccessRestModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBullMqOptions(config),
    }),
  ],
})
export class AppModule {}

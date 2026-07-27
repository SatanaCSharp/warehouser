import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'auth/auth.module';
import { createTypeOrmOptions } from 'shared/database/typeorm.options.js';
import { AppLoggerModule } from 'shared/logger/app-logger.module.js';
import { createBullMqOptions } from 'shared/queue/bullmq.options.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggerModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createTypeOrmOptions(config),
    }),
    AuthModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBullMqOptions(config),
    }),
  ],
})
export class AppModule {}

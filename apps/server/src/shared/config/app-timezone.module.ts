import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  APP_TIMEZONE,
  readAppTimezoneConfig,
} from 'shared/config/app-timezone.config';

/** Provides `APP_TIMEZONE` application-wide, read and validated once at bootstrap through the same
 * `ConfigService.getOrThrow` + async-factory shape `AppLoggerModule` already uses for `LOG_LEVEL`
 * (`shared/logger/app-logger.module.ts`). Registering the factory as a provider — rather than
 * calling `readAppTimezoneConfig` by hand somewhere — is what makes an invalid zone fail Nest's own
 * module graph construction: Nest instantiates every eager provider while building `AppModule`,
 * before `app.listen()` runs, so a bad `APP_TIMEZONE` stops bootstrap the same way a bad
 * `LOG_LEVEL` already does, rather than only failing `readAppTimezoneConfig` in isolation (T4;
 * `data-model.md § Time, timezone and the week`). No repository consumes the token yet — T5 injects
 * it into the first one. */
@Module({})
export class AppTimezoneModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: AppTimezoneModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: APP_TIMEZONE,
          inject: [ConfigService],
          useFactory: (config: ConfigService): string =>
            readAppTimezoneConfig(config),
        },
      ],
      exports: [APP_TIMEZONE],
    };
  }
}

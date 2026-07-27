import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

@Module({})
export class AppLoggerModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: AppLoggerModule,
      imports: [
        LoggerModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const logPretty = config.get<string>('LOG_PRETTY', 'false');
            const logLevel = config.getOrThrow<string>('LOG_LEVEL');

            const isPretty = logPretty === 'true';

            const transportOptions = {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-ddTHH:MM:ss.lZ',
                ignore: 'pid,hostname,reqId',
                singleLine: true,
              },
            };

            return {
              pinoHttp: {
                level: logLevel,
                autoLogging: false,
                quietReqLogger: true,
                transport: !isPretty ? undefined : transportOptions,
              },
            };
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}

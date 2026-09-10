import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthCookie } from 'auth/rest/auth-cookie.js';
import { AuthController } from 'auth/rest/controllers/auth.controller.js';
import { AuthUsecaseModule } from 'auth/usecases/usecase.module.js';

@Module({
  imports: [AuthUsecaseModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthCookie,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AuthCookie(config.get<string>('AUTH_COOKIE_SECURE') === 'true'),
    },
  ],
})
export class AuthRestModule {}

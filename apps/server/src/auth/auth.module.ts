import { Module } from '@nestjs/common';
import { SessionAuthGuard } from 'auth/authentication/session-auth.guard';
import { AuthRestModule } from 'auth/rest/rest.module';
import { AuthUsecaseModule } from 'auth/usecases/usecase.module';

@Module({
  imports: [AuthUsecaseModule, AuthRestModule],
  providers: [SessionAuthGuard],
  exports: [AuthUsecaseModule, SessionAuthGuard],
})
export class AuthModule {}

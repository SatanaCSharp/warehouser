import { Module } from '@nestjs/common';
import { AuthRestModule } from 'auth/rest/rest.module';
import { AuthUsecaseModule } from 'auth/usecases/usecase.module';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';

@Module({
  imports: [AuthUsecaseModule, AuthRestModule],
  providers: [SessionAuthGuard],
  exports: [AuthUsecaseModule, SessionAuthGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AuthModule } from 'auth/auth.module';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WorkspaceController } from 'workspaces/rest/controllers/workspace.controller';
import { WorkspacesUsecaseModule } from 'workspaces/usecases/usecase.module';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WorkspaceAccessGuard`
// is shared transport infrastructure from `shared/guards/` and is only
// registered here so Nest can construct it for this module's routes.
// `AccessUsecaseModule` supplies the workspace-scoped role, member and
// owner-transfer use cases `WorkspaceController` still invokes, which now live
// in `access`; those eleven handlers move there next, at which point this
// import goes with them.
@Module({
  imports: [AuthModule, WorkspacesUsecaseModule, AccessUsecaseModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceAccessGuard],
})
export class WorkspacesRestModule {}

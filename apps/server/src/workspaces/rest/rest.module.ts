import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WorkspaceController } from 'workspaces/rest/controllers/workspace.controller';
import { WorkspacesUsecaseModule } from 'workspaces/usecases/usecase.module';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WorkspaceAccessGuard`
// is shared transport infrastructure from `shared/guards/` and is only
// registered here so Nest can construct it for the `PATCH` route. Registering a
// guard is not owning it (ADR 14-08-2026, CR-RG-06).
//
// The eleven workspace-access handlers moved to `access`'s
// `WorkspaceAccessController` (CH-S2), and `AccessUsecaseModule` went with them:
// every use case the remaining controller injects is a `workspaces` one again.
@Module({
  imports: [AuthModule, WorkspacesUsecaseModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceAccessGuard],
})
export class WorkspacesRestModule {}

import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AppModule } from 'app.module';
import { DomainModule } from 'shared/domain/domain.module';
import { describe, expect, it } from 'vitest';
import { WorkspacesRestModule } from 'workspaces';
import { WorkspaceController } from 'workspaces/rest/controllers/workspace.controller';
import { WorkspacesUsecaseModule } from 'workspaces/usecases/usecase.module';

type Constructor = new (...args: never[]) => unknown;

const metadata = (key: string, target: unknown): Constructor[] =>
  (Reflect.getMetadata(key, target as object) as Constructor[]) ?? [];

const dependenciesOf = (provider: Constructor): Constructor[] =>
  (Reflect.getMetadata('design:paramtypes', provider) as Constructor[]) ?? [];

// A dependency Nest cannot resolve only surfaces when the application boots,
// which needs a database this tier does not have. This suite proves the same
// graph statically: every provider the Workspace surface reaches is declared
// by the module that must supply it (T24 DoD, "`AppModule` registers
// `WorkspacesModule`; the server boots").
describe('workspaces module wiring', () => {
  const usecaseProviders = metadata(
    MODULE_METADATA.PROVIDERS,
    WorkspacesUsecaseModule,
  );
  // The workspace-scoped role, member and owner-transfer use cases live in
  // `AccessUsecaseModule` now, and so do the handlers that injected them
  // (CH-S2). `WorkspacesUsecaseModule` still imports `AccessUsecaseModule` for
  // `WorkspaceProvisioningService`, so its exports stay in scope here. The rule
  // this asserts is unchanged — every use case a registered controller injects
  // is exported by a use-case module the REST module imports.
  const usecaseExports = [
    ...metadata(MODULE_METADATA.EXPORTS, WorkspacesUsecaseModule),
    ...metadata(MODULE_METADATA.EXPORTS, AccessUsecaseModule),
  ];
  const domainProviders = metadata(MODULE_METADATA.PROVIDERS, DomainModule);

  it('registers the Workspace REST module in AppModule', () => {
    expect(metadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      WorkspacesRestModule,
    );
  });

  // The Warehouse-record and membership-edge REST surface left this module with
  // its handlers: the record half to `warehouses`, the membership half to
  // `access` (CH-S1, CH-S3). What remains here is the controller whose subject
  // is the Workspace itself. Only the controller inventory changed (CR-RG-01).
  it('serves the Workspace and Warehouse controllers from the use-case module', () => {
    expect(metadata(MODULE_METADATA.CONTROLLERS, WorkspacesRestModule)).toEqual(
      [WorkspaceController],
    );
    expect(metadata(MODULE_METADATA.IMPORTS, WorkspacesRestModule)).toContain(
      WorkspacesUsecaseModule,
    );
  });

  it('exports every use case the controllers inject', () => {
    [WorkspaceController].forEach((controller) =>
      dependenciesOf(controller).forEach((dependency) => {
        expect(usecaseExports).toContain(dependency);
      }),
    );
  });

  it('resolves every dependency of every registered use case', () => {
    usecaseProviders.forEach((provider) => {
      dependenciesOf(provider).forEach((dependency) => {
        // An interface-typed constructor parameter erases to `Object`; those
        // are the `@Optional()` runtime seams the use cases default
        // themselves, not injection tokens.
        if (dependency === Object || dependency === undefined) {
          return;
        }
        expect([...usecaseProviders, ...domainProviders]).toContain(dependency);
      });
    });
  });
});

import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from 'app.module';
import { DomainModule } from 'shared/domain/domain.module';
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
  const usecaseExports = metadata(
    MODULE_METADATA.EXPORTS,
    WorkspacesUsecaseModule,
  );
  const domainProviders = metadata(MODULE_METADATA.PROVIDERS, DomainModule);

  it('registers the Workspace REST module in AppModule', () => {
    expect(metadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      WorkspacesRestModule,
    );
  });

  it('serves the Workspace controller from the use-case module', () => {
    expect(metadata(MODULE_METADATA.CONTROLLERS, WorkspacesRestModule)).toEqual(
      [WorkspaceController],
    );
    expect(metadata(MODULE_METADATA.IMPORTS, WorkspacesRestModule)).toContain(
      WorkspacesUsecaseModule,
    );
  });

  it('exports every use case the controller injects', () => {
    dependenciesOf(WorkspaceController).forEach((dependency) => {
      expect(usecaseExports).toContain(dependency);
    });
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

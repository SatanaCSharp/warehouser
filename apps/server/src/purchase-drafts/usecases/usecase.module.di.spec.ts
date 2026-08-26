import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { PurchaseDraftsUsecaseModule } from 'purchase-drafts/usecases/usecase.module';
import { DataSource } from 'typeorm';

// Unlike `warehouses`/`workspaces`, `PurchaseDraftsUsecaseModule` declares its own repositories
// as local providers rather than reaching them from the `@Global()` `DomainModule`
// (`customer-orders/usecases/usecase.module.ts` establishes the same pattern for
// `ConsolidatedDemandRepository`). The one dependency that module boundary still leaves
// unsupplied is the `DataSource` those repositories take a constructor parameter of — provided
// globally here as a double, exactly as `DomainModule` provides the real one at boot, so the
// module's own repository providers construct for real and the graph resolves through Nest
// exactly as it does at boot.
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class TestDataSourceDoubleModule {}

// T14 — `module-boundaries.spec.ts` proves the providers/exports declaration by regex, which
// cannot catch a constructor parameter that erases to `Object` under
// `emitDecoratorMetadata` (a `Pick<Repository, 'method'>` injection-site type) and therefore
// cannot be resolved by Nest's injector. Compiling the real module graph through the DI container
// is the only way this repository observes that failure without a database.
describe('PurchaseDraftsUsecaseModule Nest DI graph', () => {
  it('constructs every exported Purchase Draft use case through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, PurchaseDraftsUsecaseModule],
    }).compile();

    expect(moduleRef.get(ReadyPurchaseDraftCommand)).toBeInstanceOf(
      ReadyPurchaseDraftCommand,
    );
    expect(moduleRef.get(ClosePurchaseDraftCommand)).toBeInstanceOf(
      ClosePurchaseDraftCommand,
    );
    expect(moduleRef.get(DiscardPurchaseDraftCommand)).toBeInstanceOf(
      DiscardPurchaseDraftCommand,
    );
    expect(moduleRef.get(ReadPurchaseDraftQuery)).toBeInstanceOf(
      ReadPurchaseDraftQuery,
    );
    expect(moduleRef.get(ListPurchaseDraftsQuery)).toBeInstanceOf(
      ListPurchaseDraftsQuery,
    );
  });
});
